function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── LAYER 2: STATISTICS ─────────────────────────────────────────────────────

// Linear-interpolated percentile on a pre-sorted array.
// Caller is responsible for sorting — enables O(1) repeated calls on same data.
function pctSorted(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

// Convenience: sort internally then compute percentile. O(n log n).
function sortedPct(arr, p) {
  const s = arr instanceof Float32Array || arr instanceof Float64Array
    ? Array.from(arr).sort((a, b) => a - b)
    : [...arr].sort((a, b) => a - b);
  return pctSorted(s, p);
}

// Efficiently compute multiple percentiles with a single sort pass.
function multiPct(arr, ps) {
  const s = arr instanceof Float32Array || arr instanceof Float64Array
    ? Array.from(arr).sort((a, b) => a - b)
    : [...arr].sort((a, b) => a - b);
  return ps.map(p => pctSorted(s, p));
}

// ─── LAYER 3: AUTOCORRELATION & BLOCK SIZE ───────────────────────────────────

// AR(1) autocorrelation coefficient of a series.
// ρ = Cov(X_t, X_{t-1}) / Var(X). Clamped to (-0.99, 0.99) to avoid edge cases.
// Used to assess whether trades have momentum/mean-reversion and to tune block size.
function autocorr1(series) {
  const n = series.length;
  if (n < 3) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += series[i];
  mean /= n;
  let num = 0, den = 0;
  for (let i = 1; i < n; i++) num += (series[i] - mean) * (series[i - 1] - mean);
  for (let i = 0; i < n; i++) den += (series[i] - mean) ** 2;
  return den > 0 ? Math.max(-0.99, Math.min(0.99, num / den)) : 0;
}

// Data-driven optimal block size using Lahiri (1999) rule of thumb.
// b_opt ≈ n^(1/3) × (1 + |ρ|) — larger autocorrelation → larger blocks needed.
// Clamped to [2, floor(n/3)] for statistical validity.
function optimalBlockSize(pnls) {
  const rho = autocorr1(pnls);
  const n = pnls.length;
  const raw = Math.round(Math.pow(n, 1 / 3) * (1 + Math.abs(rho)));
  return Math.max(2, Math.min(Math.floor(n / 3), raw));
}

// ─── LAYER 4: SEQUENCE GENERATORS ────────────────────────────────────────────

// Fisher-Yates in-place shuffle. O(n) using typed array for minimum allocation.
// Returns Int32Array of shuffled trade indices in [0, n).
function generateShuffle(n, rng) {
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
  }
  return idx;
}

// IID bootstrap: sample indices with replacement. O(n).
// Assumes trades are statistically independent — no autocorrelation structure.
function generateBootstrap(n, rng) {
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = Math.floor(rng() * n);
  return idx;
}

// Overlapping Circular Block Bootstrap (Politis & Romano, 1992).
// Preserves serial autocorrelation (winning/losing streaks) by sampling
// contiguous blocks of trades rather than individual trades.
//
// "Circular" means blocks wrap around the end of the trade array,
// treating the sequence as a ring. This eliminates end-effect bias
// and ensures all n positions are equally likely as block starts.
//
// Optimal block size b: use optimalBlockSize() above, or set manually.
// Larger b → more autocorrelation preserved, less variance reduction.
// Rule of thumb: b ≈ n^(1/3) for most trading sequences.
function generateBlockBootstrap(n, blockSize, rng) {
  const b = Math.max(2, Math.min(blockSize, Math.floor(n / 2)));
  const idx = new Int32Array(n);
  let pos = 0;
  // Draw ceil(n/b) block start positions, each uniform in [0, n)
  while (pos < n) {
    const start = Math.floor(rng() * n); // circular: any start is valid
    for (let i = 0; i < b && pos < n; i++) {
      idx[pos++] = (start + i) % n; // wrap circularly
    }
  }
  return idx;
}

// ─── LAYER 5: SINGLE SIMULATION WALK ────────────────────────────────────────
// Runs one equity walk from a pre-generated index sequence.
// Memory: O(chartSteps) — does NOT store the full equity path.
// Computes all metrics inline in a single O(n) pass.
//
// Returns:
//   finalEquity      — terminal equity value
//   maxDD            — maximum drawdown fraction [0, 1] (peak-to-trough / peak)
//   maxDDDuration    — longest streak of trades spent below previous equity peak
//   totalDDTrades    — total trades spent in any drawdown (for avg duration calc)
//   everRuined       — 1 if equity ever fell below ruinThreshold, else 0
//   sampledEquity    — Float32Array[chartSteps] subsampled at chartStep intervals
function walkSim(seq, n, pnls, risks, startEquity, sizingMode, fraction, chartSteps, chartStep, ruinThreshold) {
  let equity = startEquity;
  let peak = startEquity;
  let maxDD = 0;
  let curDDDuration = 0;
  let maxDDDuration = 0;
  let totalDDTrades = 0;
  let everRuined = 0;

  // Subsample chart: record equity at uniform intervals across the trade sequence
  const sampledEquity = new Float32Array(chartSteps);
  sampledEquity[0] = equity;
  let chartIdx = 1;

  for (let i = 0; i < n; i++) {
    const ti = seq[i];

    // Position sizing:
    // - pnl_direct: use recorded P&L as-is (fixed-dollar sizing assumption)
    // - r_fixed_fraction: scale trade risk to a fixed % of current equity
    //   new_pnl = recorded_pnl × (equity × fraction / original_risk)
    //   This simulates fractional Kelly / fixed-fraction compounding.
    let p;
    if (sizingMode === "r_fixed_fraction") {
      const origRisk = risks[ti];
      // Guard: if original risk is 0 (shouldn't happen), fall back to raw pnl
      p = origRisk > 0 ? pnls[ti] * ((equity * fraction) / origRisk) : pnls[ti];
    } else {
      p = pnls[ti];
    }

    equity = Math.max(0, equity + p); // hard floor at zero (ruin/bankruptcy)

    // ── Drawdown tracking ──────────────────────────────────────────────────
    if (equity > peak) {
      // New peak: reset drawdown streak counter
      peak = equity;
      curDDDuration = 0;
    } else if (equity < peak) {
      // In drawdown: extend streak counter
      curDDDuration++;
      totalDDTrades++;
      if (curDDDuration > maxDDDuration) maxDDDuration = curDDDuration;
    }
    // (equity === peak: flat, not in drawdown — no counter update)

    // Maximum drawdown fraction: (peak − equity) / peak
    if (peak > 0) {
      const dd = (peak - equity) / peak;
      if (dd > maxDD) maxDD = dd;
    }

    // ── Ruin check ─────────────────────────────────────────────────────────
    // Flag if equity ever breached the ruin threshold (default: 50% of start)
    if (!everRuined && equity < ruinThreshold) everRuined = 1;

    // ── Chart subsampling ──────────────────────────────────────────────────
    // Sample approximately every chartStep trades; guaranteed to include final point
    if (chartIdx < chartSteps - 1 && (i + 1) % chartStep === 0) {
      sampledEquity[chartIdx++] = equity;
    }
  }
  // Always record final equity as last chart point
  sampledEquity[chartSteps - 1] = equity;

  return { finalEquity: equity, maxDD, maxDDDuration, totalDDTrades, everRuined, sampledEquity };
}

// ─── LAYER 6: RESULT AGGREGATION ─────────────────────────────────────────────
// Builds the full result object from accumulated typed arrays.
// colMajor[t * numSims + s] = equity at chart step t in simulation s.
// This column-major layout enables O(numSims) column extraction for percentiles
// without any transposition overhead.
function buildMCResults(acc) {
  const {
    finalEquities, maxDrawdowns, ddDurations, ruinFlags,
    colMajor, worstPaths, chartSteps, chartStep,
    numSims, pnls, risks, startEquity, sizingMode, fraction,
    tradesPerYear, simMode, effectiveBlockSize, seed, n,
  } = acc;

  // Convert typed arrays to plain arrays for percentile computation
  const feArr = Array.from(finalEquities);
  const mdArr = Array.from(maxDrawdowns);
  const ddArr = Array.from(ddDurations);

  // ── Final equity distribution ─────────────────────────────────────────────
  const [fe_p5, fe_p25, fe_med, fe_p75, fe_p95] = multiPct(feArr, [5, 25, 50, 75, 95]);
  const finalEquityPcts = { p5: fe_p5, p25: fe_p25, median: fe_med, p75: fe_p75, p95: fe_p95 };

  // ── Max drawdown distribution (expressed as %) ────────────────────────────
  const [md_p5, md_med, md_p75, md_p95] = multiPct(mdArr, [5, 50, 75, 95]);
  const maxDrawdownPcts = {
    p5:     +(md_p5  * 100).toFixed(2),
    median: +(md_med * 100).toFixed(2),
    p75:    +(md_p75 * 100).toFixed(2),
    p95:    +(md_p95 * 100).toFixed(2),
  };

  // ── Drawdown duration distribution (in trades) ────────────────────────────
  const [dd_med, dd_p75, dd_p95] = multiPct(ddArr, [50, 75, 95]);
  const ddDurationPcts = {
    median: +dd_med.toFixed(1),
    p75:    +dd_p75.toFixed(1),
    p95:    +dd_p95.toFixed(1),
    mean:   +(ddArr.reduce((s, v) => s + v, 0) / numSims).toFixed(1),
  };

  // ── Tail risk metrics ─────────────────────────────────────────────────────

  // Probability of ending below starting equity (loss)
  const probBelowStart = +((feArr.filter(v => v < startEquity).length / numSims) * 100).toFixed(1);

  // P(max drawdown ≥ threshold) — measures tail catastrophic risk
  const probDD30 = +((mdArr.filter(v => v >= 0.30).length / numSims) * 100).toFixed(1);
  const probDD40 = +((mdArr.filter(v => v >= 0.40).length / numSims) * 100).toFixed(1);
  const probDD50 = +((mdArr.filter(v => v >= 0.50).length / numSims) * 100).toFixed(1);

  // Ruin probability: P(equity ever fell below 50% of start)
  const probRuin = +((Array.from(ruinFlags).filter(v => v === 1).length / numSims) * 100).toFixed(1);

  // VaR 95%: the 5th-percentile terminal equity
  // Interpretation: "In 5% of scenarios, you end with less than VaR95"
  const sortedFe = [...feArr].sort((a, b) => a - b);
  const varCutoff = Math.max(1, Math.floor(0.05 * numSims));
  const var95  = sortedFe[varCutoff];

  // CVaR 95% (Expected Shortfall): mean of the worst-5% outcomes
  // More coherent risk measure than VaR — captures tail shape
  const cvar95 = sortedFe.slice(0, varCutoff).reduce((s, v) => s + v, 0) / varCutoff;

  // ── Annualised performance metrics ───────────────────────────────────────

  // CAGR from the median terminal equity
  // CAGR = (medFinal / start)^(1/years) − 1
  const years = n / Math.max(1, tradesPerYear);
  const cagr = years > 0 && startEquity > 0
    ? +((Math.pow(Math.max(0.001, fe_med) / startEquity, 1 / years) - 1) * 100).toFixed(2)
    : 0;

  // Per-trade return series (normalised by starting equity for scale-independence)
  const tradeRets = pnls.map(p => startEquity > 0 ? p / startEquity : 0);
  const meanRet = tradeRets.reduce((s, v) => s + v, 0) / tradeRets.length;
  const varRet  = tradeRets.reduce((s, v) => s + (v - meanRet) ** 2, 0) / tradeRets.length;
  const stdRet  = Math.sqrt(varRet);

  // Annualised Sharpe: (mean return / std) × √(trades per year)
  // Assumes risk-free rate ≈ 0 (appropriate for short-term trading)
  const sharpe = stdRet > 0
    ? +(meanRet / stdRet * Math.sqrt(tradesPerYear)).toFixed(2)
    : 0;

  // Annualised Sortino: uses downside deviation only (target = 0)
  // More appropriate than Sharpe for skewed return distributions (trading)
  const downside = tradeRets.filter(v => v < 0);
  const downsideStd = downside.length > 0
    ? Math.sqrt(downside.reduce((s, v) => s + v ** 2, 0) / tradeRets.length)
    : 0;
  const sortino = downsideStd > 0
    ? +(meanRet / downsideStd * Math.sqrt(tradesPerYear)).toFixed(2)
    : 0;

  // Calmar ratio: CAGR / median max drawdown (annualised return per unit of max pain)
  const calmar = md_med > 0 ? +((cagr / (md_med * 100))).toFixed(2) : 0;

  // ── Equity envelope from column-major buffer ──────────────────────────────
  // For each of chartSteps timesteps, extract the column of numSims values
  // and compute the P5/P50/P95 band. O(chartSteps × numSims log numSims).
  const envelopeData = [];
  for (let t = 0; t < chartSteps; t++) {
    // Slice column t: all simulations at this timestep
    const col = Array.from(colMajor.subarray(t * numSims, (t + 1) * numSims));
    const [c_p5, c_med, c_p95] = multiPct(col, [5, 50, 95]);
    envelopeData.push({
      t: t * chartStep,
      p5:  +c_p5.toFixed(2),
      med: +c_med.toFixed(2),
      p95: +c_p95.toFixed(2),
    });
  }

  // Attach worst-path data to envelope points (stored separately from column-major)
  const wPaths = worstPaths.sort((a, b) => a.finalEquity - b.finalEquity); // ascending = worst first
  envelopeData.forEach((pt, tIdx) => {
    const clampIdx = Math.min(tIdx, chartSteps - 1);
    if (wPaths[0]) pt.w0 = +wPaths[0].path[clampIdx].toFixed(2);
    if (wPaths[1]) pt.w1 = +wPaths[1].path[clampIdx].toFixed(2);
    if (wPaths[2]) pt.w2 = +wPaths[2].path[clampIdx].toFixed(2);
  });

  return {
    finalEquity:    finalEquityPcts,
    maxDrawdown:    maxDrawdownPcts,
    ddDuration:     ddDurationPcts,
    probBelowStart,
    probDD30, probDD40, probDD50,
    probRuin,
    var95:          +var95.toFixed(2),
    cvar95:         +cvar95.toFixed(2),
    cagr,
    sharpe,
    sortino,
    calmar,
    envelopeData,
    metadata: { seed, numSims, simMode, sizingMode, effectiveBlockSize, n, tradesPerYear },
  };
}

// ─── LAYER 7: KELLY FRACTION SENSITIVITY SWEEP ───────────────────────────────
// Runs rapid simulations across a grid of risk fractions to produce a
// risk-return tradeoff table. Reveals the optimal Kelly fraction for this
// specific trade distribution.
//
// Theoretical full Kelly: f* = (p × R − q) / R  where R = avgWin/avgLoss
// In practice, half-Kelly (f*/2) is used as a safety margin.
//
// The sweep covers 0.1% → 3.0% risk per trade, running SWEEP_SIMS simulations
// per fraction with the same simMode and seed as the main run.
function runKellySweep(trades, cfg) {
  const {
    simMode = "shuffle", tradesPerYear = 50, seed = 42,
    startEquity = 10000, blockSize = 5,
  } = cfg;

  const SWEEP_SIMS = 400; // fast but statistically meaningful
  // Grid of fraction values covering typical retail/institutional range
  const fractions = [0.001, 0.002, 0.003, 0.005, 0.007, 0.010, 0.015, 0.020, 0.025, 0.030];

  const pnls  = trades.map(t => t.pnl);
  const risks = trades.map(t => t.risk_dollars || Math.abs(t.pnl) || 100);
  const n = trades.length;

  // ── Theoretical Kelly calculation ────────────────────────────────────────
  const wins   = pnls.filter(v => v > 0);
  const losses = pnls.filter(v => v < 0);
  const p = wins.length / pnls.length;       // win probability
  const q = 1 - p;                           // loss probability
  const avgW = wins.length   ? wins.reduce((s, v) => s + v, 0) / wins.length : 0;
  const avgL = losses.length ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : 1;
  const R = avgW / Math.max(1, avgL);        // win/loss ratio
  // Kelly formula: f* = (p×R − q) / R = p − q/R
  const kellyFull = R > 0 ? Math.max(0, Math.min(0.5, (p * R - q) / R)) : 0;
  const kellyHalf = kellyFull / 2;

  // ── Per-fraction simulation ───────────────────────────────────────────────
  const chartSteps = Math.min(n + 1, 30);
  const chartStep  = Math.max(1, Math.floor(n / (chartSteps - 1)));
  const ruinThreshold = startEquity * 0.5;

  const results = fractions.map((frac, fi) => {
    // Offset seed per fraction to ensure independence across sweep points
    const rng = mulberry32(seed + 1000 + fi * 7919); // 7919 is prime

    const finalArr = new Float32Array(SWEEP_SIMS);
    const ddArr    = new Float32Array(SWEEP_SIMS);
    let ruinCount  = 0;

    for (let s = 0; s < SWEEP_SIMS; s++) {
      let seq;
      if (simMode === "shuffle")           seq = generateShuffle(n, rng);
      else if (simMode === "bootstrap")     seq = generateBootstrap(n, rng);
      else seq = generateBlockBootstrap(n, Math.max(2, blockSize), rng);

      const res = walkSim(seq, n, pnls, risks, startEquity,
        "r_fixed_fraction", frac, chartSteps, chartStep, ruinThreshold);
      finalArr[s] = res.finalEquity;
      ddArr[s]    = res.maxDD;
      if (res.everRuined) ruinCount++;
    }

    const medFinal = sortedPct(finalArr, 50);
    const medDD    = sortedPct(ddArr, 50);
    const years    = n / Math.max(1, tradesPerYear);
    const cagr     = years > 0 && startEquity > 0
      ? +((Math.pow(Math.max(0.001, medFinal) / startEquity, 1 / years) - 1) * 100).toFixed(1)
      : 0;
    const probRuin = +((ruinCount / SWEEP_SIMS) * 100).toFixed(1);

    // Identify the closest fraction to full Kelly and half Kelly
    const distFull = Math.abs(frac - kellyFull);
    const distHalf = Math.abs(frac - kellyHalf);
    const isNearFullKelly = distFull === Math.min(...fractions.map(f => Math.abs(f - kellyFull)));
    const isNearHalfKelly = distHalf === Math.min(...fractions.map(f => Math.abs(f - kellyHalf)));

    return {
      fraction:   frac,
      fracPct:    (frac * 100).toFixed(1),
      medianFinal: +medFinal.toFixed(0),
      medianDD:   +(medDD * 100).toFixed(1),
      probRuin,
      cagr,
      isNearFullKelly,
      isNearHalfKelly,
    };
  });

  return {
    results,
    kellyFull: +(kellyFull * 100).toFixed(2),
    kellyHalf: +(kellyHalf * 100).toFixed(2),
    autocorr:  +autocorr1(pnls).toFixed(3),
    suggestedBlockSize: optimalBlockSize(pnls),
  };
}

// ─── LAYER 8: ASYNC CHUNKED RUNNER ───────────────────────────────────────────
// Executes numSims simulations in chunks of CHUNK, yielding to the browser's
// event loop between chunks via setTimeout(fn, 0). This prevents UI freezing
// on large simulation counts and enables progress bar updates.
//
// Progress: calls onProgress(fraction: 0..1) after each chunk
// Completion: calls onDone(result) when all chunks finish
// Cancellation: returns a cancel() function; calling it stops further chunks
function runMonteCarloAsync(trades, cfg, onProgress, onDone) {
  const {
    simMode       = "shuffle",
    numSims       = 1000,
    sizingMode    = "pnl_direct",
    fraction      = 0.01,
    tradesPerYear = 50,
    blockSize     = 5,
    seed          = 42,
    startEquity   = 10000,
    autoBlockSize = false,    // if true, compute optimal block size from data
  } = cfg;

  if (!trades || trades.length < 2) { onDone(null); return () => {}; }

  const pnls  = trades.map(t => t.pnl);
  const risks = trades.map(t => t.risk_dollars || Math.abs(t.pnl) || 100);
  const n     = trades.length;

  // Data-driven block size: use optimalBlockSize() or manual override
  const effectiveBlockSize = (simMode === "block_bootstrap" && autoBlockSize)
    ? optimalBlockSize(pnls)
    : Math.max(2, blockSize);

  // ── Chart subsampling parameters ──────────────────────────────────────────
  // Cap to 60 chart points regardless of trade count for render performance.
  // chartStep = how many trades between each sampled equity value.
  const MAX_CHART_STEPS = 60;
  const chartSteps = Math.min(n + 1, MAX_CHART_STEPS);
  const chartStep  = Math.max(1, Math.floor(n / (chartSteps - 1)));

  // ── Pre-allocated accumulator arrays ─────────────────────────────────────
  // Float32 is sufficient: 4-byte precision avoids the 8× memory cost of Float64
  // for equity curves where sub-cent precision isn't required.
  const finalEquities = new Float32Array(numSims);
  const maxDrawdowns  = new Float32Array(numSims);
  const ddDurations   = new Float32Array(numSims);
  const ruinFlags     = new Uint8Array(numSims);

  // Column-major envelope buffer: colMajor[t * numSims + s] = equity at step t, sim s
  // Total size: chartSteps × numSims × 4 bytes
  // For 60 steps × 10,000 sims: 60 × 10,000 × 4 = 2.4 MB — well within budget
  const colMajor = new Float32Array(chartSteps * numSims);

  // Track worst K=3 paths by maintaining a sorted array of {finalEquity, path}
  // updated every simulation. Small K means O(K) tracking overhead per sim.
  const K_WORST = 3;
  let worstPaths = []; // ascending by finalEquity (index 0 = worst)

  const ruinThreshold = startEquity * 0.5; // 50% ruin definition
  const CHUNK = 250; // simulations per event-loop yield
  let offset = 0;
  let cancelled = false;
  const rng = mulberry32(seed);

  function processChunk() {
    if (cancelled) return;

    const end = Math.min(offset + CHUNK, numSims);

    for (let s = offset; s < end; s++) {
      // Generate resampled sequence for this simulation
      let seq;
      if (simMode === "shuffle")        seq = generateShuffle(n, rng);
      else if (simMode === "bootstrap") seq = generateBootstrap(n, rng);
      else                              seq = generateBlockBootstrap(n, effectiveBlockSize, rng);

      // Run the equity walk — single pass, O(n), O(chartSteps) memory
      const res = walkSim(
        seq, n, pnls, risks, startEquity,
        sizingMode, fraction, chartSteps, chartStep, ruinThreshold
      );

      // Store scalar results in typed arrays
      finalEquities[s] = res.finalEquity;
      maxDrawdowns[s]  = res.maxDD;
      ddDurations[s]   = res.maxDDDuration;
      ruinFlags[s]     = res.everRuined;

      // Write equity samples into column-major buffer
      // Writing is sequential in s (column position), which is cache-unfriendly per sim
      // but cache-friendly when reading columns later for percentile computation.
      for (let t = 0; t < chartSteps; t++) {
        colMajor[t * numSims + s] = res.sampledEquity[t];
      }

      // ── Worst-path tracking ───────────────────────────────────────────────
      // Maintain a set of K worst simulations seen so far.
      // We store the full sampled path (not the full equity array) since
      // worstPaths are only used for chart rendering, not statistical computation.
      if (worstPaths.length < K_WORST) {
        worstPaths.push({ finalEquity: res.finalEquity, path: res.sampledEquity.slice() });
        // Keep descending sort (index 0 = best in the worst set = easiest to evict)
        worstPaths.sort((a, b) => b.finalEquity - a.finalEquity);
      } else if (res.finalEquity < worstPaths[0].finalEquity) {
        // This sim is worse than the current "least bad" worst path — replace it
        worstPaths[0] = { finalEquity: res.finalEquity, path: res.sampledEquity.slice() };
        worstPaths.sort((a, b) => b.finalEquity - a.finalEquity);
      }
    }

    offset = end;
    onProgress(offset / numSims);

    if (offset < numSims) {
      // Yield to event loop, then continue with next chunk
      setTimeout(processChunk, 0);
    } else {
      // All simulations complete — build and return result
      onDone(buildMCResults({
        finalEquities, maxDrawdowns, ddDurations, ruinFlags,
        colMajor, worstPaths, chartSteps, chartStep,
        numSims, pnls, risks, startEquity,
        sizingMode, fraction, tradesPerYear,
        simMode, effectiveBlockSize, seed, n,
      }));
    }
  }

  // Kick off first chunk asynchronously
  setTimeout(processChunk, 0);

  // Return cancellation function
  return () => { cancelled = true; };
}



export { mulberry32, pctSorted, sortedPct, multiPct, autocorr1, optimalBlockSize, generateShuffle, generateBootstrap, generateBlockBootstrap, walkSim, buildMCResults, runKellySweep, runMonteCarloAsync };
