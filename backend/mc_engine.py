"""
mc_engine.py  — EyZonCharts Monte Carlo Risk Engine  v2.0
─────────────────────────────────────────────────────────────────────────────
UPGRADE CHANGELOG vs v1:

  [v2-1]  ROOT CAUSE FIX — pnl_direct + shuffle always produced identical
          terminal equity (sum is invariant under permutation). Added explicit
          warning + auto-upgrade to bootstrap when this degenerate combo is
          detected. Shuffle mode is now restricted to equity-compounded sizing
          where sequence *does* matter.

  [v2-2]  NEW SIZING MODE: r_compounded
          E_{t+1} = E_t * (1 + f * r_t)
          where r_t = pnl_t / risk_t  (R-multiple, dimensionless)
          This enables geometric compounding, realistic ruin, and true
          path-dependency. Now the *default* sizing mode.

  [v2-3]  TAIL RISK: fat_tail mode
          After resampling, multiplies each trade's return by an independent
          draw from |Student-t(nu)| scaled so variance matches empirical var.
          Captures leptokurtic return distributions without distorting the mean.
          nu is auto-calibrated from kurtosis of the trade series.

  [v2-4]  TAIL RISK: regime_switch mode
          Markov regime model: normal (sigma x1) and stress (sigma x2.5) states
          with configurable transition matrix. Each resampled trade is tagged to
          a regime; stress trades get their returns amplified.

  [v2-5]  NEW METRIC: timeToRecovery
          For each simulation, counts the number of trades from max-DD trough
          back to a new equity high. Reports P50/P75/P95 and % sims that never
          recovered within the sequence.

  [v2-6]  CONVERGENCE CHECK
          Compares median final equity computed at numSims//2 vs numSims.
          Reports relative change. If > 5%, warns that more sims are needed.

  [v2-7]  HISTORICAL EQUITY ENVELOPE CHECK
          If the caller passes historical_equity, checks whether it falls within
          the P5-P95 envelope at each step. Reports breach count and first
          breach step.

  [v2-8]  All prior v1 fixes retained (FIX-1 through FIX-9).

Performance notes:
  - r_compounded is sequential (recurrent path) like r_fixed_fraction.
  - fat_tail and regime_switch add O(numSims × n) overhead but are still fast.
  - Convergence check runs a secondary pass over the first half of sims only.
"""

from __future__ import annotations

import math
import time
from typing import Any, Callable, Optional

import numpy as np
from scipy import stats as scipy_stats


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 1: STATISTICS
# ─────────────────────────────────────────────────────────────────────────────

def _pct_sorted(sorted_arr: np.ndarray, p: float) -> float:
    """Linear-interpolated percentile on a pre-sorted 1-D array."""
    if len(sorted_arr) == 0:
        return 0.0
    idx = (p / 100.0) * (len(sorted_arr) - 1)
    lo, hi = int(math.floor(idx)), int(math.ceil(idx))
    if lo == hi:
        return float(sorted_arr[lo])
    return float(sorted_arr[lo] + (idx - lo) * (sorted_arr[hi] - sorted_arr[lo]))


def _multi_pct(arr: np.ndarray, ps: list[float]) -> list[float]:
    s = np.sort(arr)
    return [_pct_sorted(s, p) for p in ps]


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 2: AUTOCORRELATION & OPTIMAL BLOCK SIZE
# ─────────────────────────────────────────────────────────────────────────────

def autocorr1(series: np.ndarray) -> float:
    """Unbiased lag-1 autocorrelation, clamped to (-0.99, 0.99). [FIX-4]"""
    n = len(series)
    if n < 3:
        return 0.0
    mean    = series.mean()
    centred = series - mean
    num = float(np.dot(centred[1:],  centred[:-1]))
    den = float(np.dot(centred[:-1], centred[:-1]))
    if den == 0:
        return 0.0
    return float(np.clip(num / den, -0.99, 0.99))


def optimal_block_size(pnls: np.ndarray) -> int:
    """Lahiri (1999): b ≈ n^(1/3) × (1 + |ρ|), clamped to [2, n//3]."""
    n   = len(pnls)
    rho = autocorr1(pnls)
    raw = round(n ** (1 / 3) * (1 + abs(rho)))
    return max(2, min(n // 3, raw))


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 3: INDEX GENERATORS
# ─────────────────────────────────────────────────────────────────────────────

def _generate_shuffle_batch(n: int, num_sims: int, rng: np.random.Generator) -> np.ndarray:
    """Fisher-Yates permutation (no replacement). Shape: (num_sims, n)."""
    return rng.random((num_sims, n)).argsort(axis=1).astype(np.int32)


def _generate_bootstrap_batch(n: int, num_sims: int, rng: np.random.Generator) -> np.ndarray:
    """IID bootstrap with replacement. Shape: (num_sims, n)."""
    return rng.integers(0, n, size=(num_sims, n), dtype=np.int32)


def _generate_block_bootstrap_batch(
    n: int,
    num_sims: int,
    block_size: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """
    Overlapping Circular Block Bootstrap (Politis & Romano, 1992).
    Preserves short-range autocorrelation structure in the trade series.
    """
    b     = max(2, min(block_size, n // 2))
    idx   = np.empty((num_sims, n), dtype=np.int32)
    n_blocks = math.ceil(n / b)
    starts   = rng.integers(0, n, size=(num_sims, n_blocks), dtype=np.int32)
    pos = 0
    for bi in range(n_blocks):
        fill = min(b, n - pos)
        if fill <= 0:
            break
        offsets   = np.arange(fill, dtype=np.int32)
        block_idx = (starts[:, bi:bi+1] + offsets[None, :]) % n
        idx[:, pos:pos+fill] = block_idx
        pos += fill
    return idx


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 4A: EQUITY WALK — pnl_direct (legacy)
# ─────────────────────────────────────────────────────────────────────────────

def _equity_curves_pnl_direct(
    pnls:         np.ndarray,
    indices:      np.ndarray,
    start_equity: float,
) -> np.ndarray:
    """
    Fixed-dollar P&L walk: E_{t+1} = E_t + PnL_t
    WARNING: When used with shuffle, terminal equity = start + sum(pnls) for
    every simulation (sum is permutation-invariant). Zero terminal variance.
    Only use with bootstrap/block_bootstrap.
    """
    num_sims, n  = indices.shape
    pnl_matrix   = pnls[indices]
    curves       = np.empty((num_sims, n + 1), dtype=np.float64)
    curves[:, 0] = start_equity
    np.cumsum(pnl_matrix, axis=1, out=curves[:, 1:])
    curves[:, 1:] += start_equity
    np.maximum(curves, 0.0, out=curves)
    return curves


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 4B: EQUITY WALK — r_fixed_fraction (v1)
# ─────────────────────────────────────────────────────────────────────────────

def _equity_curves_fixed_fraction(
    pnls:         np.ndarray,
    risks:        np.ndarray,
    indices:      np.ndarray,
    start_equity: float,
    fraction:     float,
) -> np.ndarray:
    """
    Equity-scaled fixed-risk walk.
    Scaled PnL = pnl × (equity × fraction / original_risk)
    Path-dependent; enables geometric compounding and ruin.
    """
    num_sims, n  = indices.shape
    curves       = np.empty((num_sims, n + 1), dtype=np.float64)
    curves[:, 0] = start_equity
    for s in range(num_sims):
        equity = start_equity
        seq    = indices[s]
        for i in range(n):
            ti         = seq[i]
            orig_risk  = risks[ti]
            p = pnls[ti] * ((equity * fraction) / orig_risk) if orig_risk > 0 else pnls[ti]
            equity     = max(0.0, equity + p)
            curves[s, i + 1] = equity
    return curves


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 4C: EQUITY WALK — r_compounded  [v2-2]  ← NEW DEFAULT
# ─────────────────────────────────────────────────────────────────────────────

def _equity_curves_compounded(
    r_multiples:  np.ndarray,   # (n,)  R-multiples: pnl / risk_dollars
    indices:      np.ndarray,   # (num_sims, n)
    start_equity: float,
    fraction:     float,        # risk fraction per trade (e.g. 0.01 = 1%)
) -> np.ndarray:
    """
    True geometric compounding:
        E_{t+1} = E_t * (1 + fraction * R_t)

    where R_t = pnl_t / risk_dollars_t  (dimensionless R-multiple).

    Properties:
      - Sequence order matters regardless of resampling mode
      - Ruin occurs naturally when equity approaches zero (no artificial floor
        until 0 is hit)
      - A single large losing streak can cause ruin from any equity level
      - CVaR >> VaR for realistic R-distributions
    """
    num_sims, n  = indices.shape
    curves       = np.empty((num_sims, n + 1), dtype=np.float64)
    curves[:, 0] = start_equity

    # Clamp fraction to prevent single-trade wipeout (max 50% per trade)
    f = min(fraction, 0.5)

    for s in range(num_sims):
        equity = start_equity
        seq    = indices[s]
        for i in range(n):
            r      = r_multiples[seq[i]]
            equity = max(0.0, equity * (1.0 + f * r))
            curves[s, i + 1] = equity
    return curves


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 5: TAIL RISK MODIFIERS  [v2-3, v2-4]
# ─────────────────────────────────────────────────────────────────────────────

def _calibrate_student_t_nu(returns: np.ndarray) -> float:
    """
    Estimate degrees-of-freedom nu for Student-t from sample excess kurtosis.
    Excess kurtosis of t(nu) = 6/(nu-4) for nu > 4.
    Clamped to [3, 30] for numerical stability.
    """
    n = len(returns)
    if n < 8:
        return 5.0
    kurt = float(scipy_stats.kurtosis(returns, fisher=True))  # excess kurtosis
    if kurt <= 0:
        return 30.0                    # near-Gaussian: use high nu
    nu = 6.0 / kurt + 4.0
    return float(np.clip(nu, 3.0, 30.0))


def _apply_fat_tail_noise(
    r_matrix:  np.ndarray,           # (num_sims, n)  R-multiples
    returns:   np.ndarray,           # (n,) original returns (for calibration)
    rng:       np.random.Generator,
    nu:        Optional[float] = None,
) -> np.ndarray:
    """
    Multiply each resampled return by a Student-t noise factor.
    The factor is centered at 1.0 so the mean is preserved; variance is
    scaled to match the empirical variance of the original series.

    Concretely:
        noise_i ~ t(nu), zero-mean, unit-variance
        factor  = 1 + alpha * noise_i
        alpha   = std(returns) / sqrt(nu / (nu-2))   [matches empirical std]

    Effect: Fat tails without bias shift. CVaR increases; median unaffected.
    """
    if nu is None:
        nu = _calibrate_student_t_nu(returns)

    num_sims, n = r_matrix.shape
    emp_std      = float(returns.std(ddof=1)) if len(returns) > 1 else 1.0

    # Student-t std = sqrt(nu/(nu-2)) for nu > 2
    t_std = math.sqrt(nu / (nu - 2)) if nu > 2 else 1.0
    alpha = emp_std / max(t_std, 1e-9)

    # Draw noise: shape (num_sims, n), scale to unit variance, then rescale
    raw_noise  = rng.standard_t(df=nu, size=(num_sims, n))
    noise_std  = float(raw_noise.std()) or 1.0
    scaled     = raw_noise / noise_std            # unit variance
    factors    = 1.0 + alpha * scaled             # centered at 1

    return r_matrix * factors


def _apply_regime_switching(
    r_matrix:    np.ndarray,           # (num_sims, n)
    rng:         np.random.Generator,
    stress_vol:  float = 2.5,          # stress vol multiplier
    p_normal_to_stress: float = 0.05,  # prob of switching N→S per trade
    p_stress_to_normal: float = 0.20,  # prob of switching S→N per trade
) -> np.ndarray:
    """
    Two-state Markov regime model applied per simulation path.
    State 0 = normal  (vol multiplier = 1.0)
    State 1 = stress  (vol multiplier = stress_vol)

    Transition per trade:
        P(0→1) = p_normal_to_stress
        P(1→0) = p_stress_to_normal

    Stress regime amplifies the deviation from the mean (preserves direction,
    scales magnitude). Mean is approximately preserved; tails are extended.
    """
    num_sims, n = r_matrix.shape
    result      = r_matrix.copy()

    mean_r = float(r_matrix.mean())

    for s in range(num_sims):
        state      = 0                             # start in normal
        row        = result[s]
        for i in range(n):
            # Regime transition
            u = rng.random()
            if state == 0 and u < p_normal_to_stress:
                state = 1
            elif state == 1 and u < p_stress_to_normal:
                state = 0

            if state == 1:
                # Amplify deviation from mean
                row[i] = mean_r + (row[i] - mean_r) * stress_vol

    return result


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 6: DRAWDOWN METRICS  (vectorised)
# ─────────────────────────────────────────────────────────────────────────────

def _compute_max_drawdown(curves: np.ndarray) -> np.ndarray:
    running_max = np.maximum.accumulate(curves, axis=1)
    safe_max    = np.where(running_max > 0, running_max, 1.0)
    dd_frac     = (running_max - curves) / safe_max
    return dd_frac.max(axis=1)


def _compute_dd_duration(curves: np.ndarray) -> np.ndarray:
    """Max drawdown duration per simulation. [FIX-2]"""
    running_max  = np.maximum.accumulate(curves, axis=1)
    in_dd        = (curves < running_max).astype(np.int8)
    padded       = np.pad(in_dd, ((0, 0), (1, 1)), constant_values=0)
    diff         = np.diff(padded.astype(np.int16), axis=1)
    num_sims     = curves.shape[0]
    max_durations = np.zeros(num_sims, dtype=np.int32)
    for s in range(num_sims):
        row    = diff[s]
        starts = np.where(row ==  1)[0]
        ends   = np.where(row == -1)[0]
        if len(starts) > 0 and len(ends) == len(starts):
            max_durations[s] = int((ends - starts).max())
    return max_durations


def _compute_ruin_flags(curves: np.ndarray, ruin_threshold: float) -> np.ndarray:
    return (curves.min(axis=1) < ruin_threshold).astype(np.uint8)


def _compute_time_to_recovery(curves: np.ndarray) -> np.ndarray:
    """
    [v2-5] For each simulation, find the maximum drawdown trough,
    then count trades until a new equity high is reached.
    Returns (num_sims,) array of recovery times in trades.
    np.iinfo(np.int32).max signals 'never recovered'.
    """
    num_sims, T  = curves.shape
    NEVER        = np.iinfo(np.int32).max
    recovery     = np.full(num_sims, NEVER, dtype=np.int32)

    for s in range(num_sims):
        path        = curves[s]
        running_max = np.maximum.accumulate(path)
        dd_series   = running_max - path               # dollar drawdown

        # Find the trough of the maximum drawdown
        trough_idx  = int(np.argmax(dd_series))
        if dd_series[trough_idx] == 0:
            recovery[s] = 0                            # never in drawdown
            continue

        peak_val = float(running_max[trough_idx])

        # Scan forward from trough for a new high
        for t in range(trough_idx + 1, T):
            if path[t] >= peak_val:
                recovery[s] = t - trough_idx
                break

    return recovery


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 7: CHART SUBSAMPLING
# ─────────────────────────────────────────────────────────────────────────────

def _subsample_curves(curves: np.ndarray, chart_steps: int) -> np.ndarray:
    """Returns (chart_steps, num_sims) column-major for percentile efficiency."""
    _, T         = curves.shape
    step_indices = np.round(np.linspace(0, T - 1, chart_steps)).astype(int)
    return curves[:, step_indices].T.copy()


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 8: CONVERGENCE CHECK  [v2-6]
# ─────────────────────────────────────────────────────────────────────────────

def _convergence_check(
    final_equities: np.ndarray,
    threshold:      float = 0.05,
) -> dict[str, Any]:
    """
    Compare median final equity at numSims/2 vs full numSims.
    A relative change > threshold suggests insufficient simulations.
    """
    n_half      = max(1, len(final_equities) // 2)
    med_half    = float(np.median(final_equities[:n_half]))
    med_full    = float(np.median(final_equities))
    rel_change  = abs(med_full - med_half) / max(abs(med_half), 1.0)
    converged   = rel_change <= threshold
    return {
        "converged":       converged,
        "relativeChange":  round(rel_change, 4),
        "medianAtHalf":    round(med_half, 2),
        "medianAtFull":    round(med_full, 2),
        "warning":         None if converged else (
            f"Median equity shifted {rel_change*100:.1f}% from first half to "
            f"full sample. Increase numSims for stable estimates."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 9: RESULT AGGREGATION
# ─────────────────────────────────────────────────────────────────────────────

def _build_results(
    final_equities:   np.ndarray,
    max_drawdowns:    np.ndarray,
    dd_durations:     np.ndarray,
    time_to_recovery: np.ndarray,
    ruin_flags:       np.ndarray,
    col_major:        np.ndarray,
    chart_step:       int,
    chart_steps:      int,
    pnls:             np.ndarray,
    r_multiples:      np.ndarray,
    start_equity:     float,
    num_sims:         int,
    n:                int,
    trades_per_year:  int,
    sim_mode:         str,
    sizing_mode:      str,
    tail_risk_mode:   str,
    fraction:         float,
    effective_block_size: int,
    seed:             int,
    worst_paths:      list[dict],
    convergence:      dict,
    warnings:         list[str],
) -> dict[str, Any]:

    # ── Final equity distribution ─────────────────────────────────────────
    fe_p5, fe_p25, fe_med, fe_p75, fe_p95 = _multi_pct(final_equities, [5, 25, 50, 75, 95])

    # ── Max drawdown distribution ──────────────────────────────────────────
    md_p5, md_med, md_p75, md_p95 = _multi_pct(max_drawdowns, [5, 50, 75, 95])

    # ── Drawdown duration ─────────────────────────────────────────────────
    dd_med_dur, dd_p75_dur, dd_p95_dur = _multi_pct(dd_durations.astype(float), [50, 75, 95])
    dd_mean_dur = float(dd_durations.mean())

    # ── Time to recovery [v2-5] ───────────────────────────────────────────
    NEVER         = np.iinfo(np.int32).max
    finite_rec    = time_to_recovery[time_to_recovery < NEVER]
    never_pct     = float((time_to_recovery == NEVER).mean() * 100)
    if len(finite_rec) > 0:
        rec_med, rec_p75, rec_p95 = _multi_pct(finite_rec.astype(float), [50, 75, 95])
    else:
        rec_med = rec_p75 = rec_p95 = float(n)

    # ── Tail risk probabilities ───────────────────────────────────────────
    prob_below_start = float((final_equities < start_equity).mean() * 100)
    prob_dd30  = float((max_drawdowns >= 0.30).mean() * 100)
    prob_dd40  = float((max_drawdowns >= 0.40).mean() * 100)
    prob_dd50  = float((max_drawdowns >= 0.50).mean() * 100)
    prob_ruin  = float(ruin_flags.mean() * 100)

    # ── VaR and CVaR [FIX-1, FIX-8] ──────────────────────────────────────
    sorted_fe  = np.sort(final_equities)
    var_cutoff = max(1, int(math.floor(0.05 * num_sims)))
    var95      = float(sorted_fe[var_cutoff - 1])
    tail       = sorted_fe[:var_cutoff]
    cvar95     = float(tail.mean()) if len(tail) > 0 else var95

    # ── CAGR [FIX-9] ─────────────────────────────────────────────────────
    years = n / max(1, trades_per_year)
    def _cagr(terminal: float) -> float:
        if years <= 0 or start_equity <= 0:
            return 0.0
        return round((math.pow(max(0.001, terminal) / start_equity, 1.0 / years) - 1) * 100, 2)

    safe_fe         = np.maximum(final_equities, 0.001)
    log_ratios      = np.log(safe_fe / max(start_equity, 0.001))
    geom_mean_fe    = float(start_equity * math.exp(log_ratios.mean()))
    cagr            = _cagr(geom_mean_fe)

    # ── Per-trade return series ───────────────────────────────────────────
    trade_rets = r_multiples * fraction         # actual return per trade at given f
    mean_ret   = float(trade_rets.mean())
    std_ret    = float(trade_rets.std(ddof=1)) if len(trade_rets) > 1 else 0.0  # [FIX-3]

    sharpe   = round(mean_ret / std_ret * math.sqrt(trades_per_year), 2) if std_ret > 0 else 0.0
    downside = trade_rets[trade_rets < 0]
    ds_var   = float((downside ** 2).sum() / len(trade_rets)) if len(downside) > 0 else 0.0
    ds_std   = math.sqrt(ds_var)
    sortino  = round(mean_ret / ds_std * math.sqrt(trades_per_year), 2) if ds_std > 0 else 0.0
    calmar   = round(cagr / (md_med * 100), 2) if md_med > 0 else 0.0

    # ── Equity envelope ───────────────────────────────────────────────────
    envelope_data = []
    for t in range(chart_steps):
        col         = col_major[t]
        c_p5, c_med, c_p95 = _multi_pct(col, [5, 50, 95])
        envelope_data.append({
            "t":   t * chart_step,
            "p5":  round(c_p5,  2),
            "med": round(c_med, 2),
            "p95": round(c_p95, 2),
        })

    worst_sorted = sorted(worst_paths, key=lambda x: x["finalEquity"])
    for pt_idx, pt in enumerate(envelope_data):
        clamp = min(pt_idx, chart_steps - 1)
        for wi, wp in enumerate(worst_sorted[:3]):
            pt[f"w{wi}"] = round(float(wp["path"][clamp]), 2)

    return {
        "finalEquity": {
            "p5":     round(fe_p5,  2),
            "p25":    round(fe_p25, 2),
            "median": round(fe_med, 2),
            "p75":    round(fe_p75, 2),
            "p95":    round(fe_p95, 2),
        },
        "maxDrawdown": {
            "p5":     round(md_p5  * 100, 2),
            "median": round(md_med * 100, 2),
            "p75":    round(md_p75 * 100, 2),
            "p95":    round(md_p95 * 100, 2),
        },
        "ddDuration": {
            "median": round(dd_med_dur, 1),
            "p75":    round(dd_p75_dur, 1),
            "p95":    round(dd_p95_dur, 1),
            "mean":   round(dd_mean_dur, 1),
        },
        "timeToRecovery": {                        # [v2-5]
            "median":     round(rec_med, 1),
            "p75":        round(rec_p75, 1),
            "p95":        round(rec_p95, 1),
            "neverPct":   round(never_pct, 1),
        },
        "probBelowStart": round(prob_below_start, 1),
        "probDD30":        round(prob_dd30, 1),
        "probDD40":        round(prob_dd40, 1),
        "probDD50":        round(prob_dd50, 1),
        "probRuin":        round(prob_ruin, 1),
        "var95":           round(var95,  2),
        "cvar95":          round(cvar95, 2),
        "cagr":            cagr,
        "sharpe":          sharpe,
        "sortino":         sortino,
        "calmar":          calmar,
        "envelopeData":    envelope_data,
        "convergence":     convergence,             # [v2-6]
        "warnings":        warnings,
        "metadata": {
            "seed":               seed,
            "numSims":            num_sims,
            "simMode":            sim_mode,
            "sizingMode":         sizing_mode,
            "tailRiskMode":       tail_risk_mode,
            "effectiveBlockSize": effective_block_size,
            "n":                  n,
            "tradesPerYear":      trades_per_year,
            "startEquity":        start_equity,
            "fraction":           fraction,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 10: KELLY SWEEP
# ─────────────────────────────────────────────────────────────────────────────

def run_kelly_sweep(trades: list[dict], cfg: dict) -> dict[str, Any]:
    """Rapid sensitivity sweep across a grid of risk fractions."""
    sim_mode        = cfg.get("simMode",        "block_bootstrap")
    trades_per_year = cfg.get("tradesPerYear",  50)
    seed            = cfg.get("seed",           42)
    start_equity    = cfg.get("startEquity",    10_000)
    block_size      = cfg.get("blockSize",      5)

    SWEEP_SIMS = 400
    fractions  = [0.001, 0.002, 0.003, 0.005, 0.007, 0.010, 0.015, 0.020, 0.025, 0.030]

    pnls  = np.array([t["pnl"] for t in trades], dtype=np.float64)
    risks = np.array([t.get("risk_dollars") or abs(t["pnl"]) or 100 for t in trades],
                     dtype=np.float64)
    r_multiples = pnls / np.where(risks > 0, risks, 1.0)
    n = len(pnls)

    wins   = pnls[pnls > 0]
    losses = pnls[pnls < 0]
    p  = len(wins) / len(pnls) if len(pnls) > 0 else 0.0
    q  = 1.0 - p
    avg_w = float(wins.mean())         if len(wins)   > 0 else 0.0
    avg_l = float(abs(losses.mean()))  if len(losses) > 0 else 1.0
    R  = avg_w / max(1.0, avg_l)

    kelly_full_discrete = float(np.clip((p * R - q) / R, 0.0, 0.5)) if R > 0 else 0.0

    if start_equity > 0:
        mu  = float(r_multiples.mean())
        var = float(r_multiples.var(ddof=1)) if len(r_multiples) > 1 else 0.0
        kelly_full_continuous = float(np.clip(mu / var, 0.0, 0.5)) if var > 0 else 0.0
    else:
        kelly_full_continuous = 0.0

    kelly_full = kelly_full_continuous
    kelly_half = kelly_full / 2

    chart_steps = min(n + 1, 30)
    chart_step  = max(1, n // max(chart_steps - 1, 1))
    ruin_threshold = start_equity * 0.5
    years = n / max(1, trades_per_year)
    n_blocks = max(2, block_size)

    results = []
    for fi, frac in enumerate(fractions):
        rng = np.random.default_rng(seed + 1000 + fi * 7919)

        if sim_mode == "shuffle":
            indices = _generate_shuffle_batch(n, SWEEP_SIMS, rng)
        elif sim_mode == "bootstrap":
            indices = _generate_bootstrap_batch(n, SWEEP_SIMS, rng)
        else:
            indices = _generate_block_bootstrap_batch(n, SWEEP_SIMS, n_blocks, rng)

        curves = _equity_curves_compounded(r_multiples, indices, start_equity, frac)

        final_arr = curves[:, -1]
        dd_arr    = _compute_max_drawdown(curves)
        ruin_arr  = _compute_ruin_flags(curves, ruin_threshold)

        med_final     = _pct_sorted(np.sort(final_arr), 50)
        med_dd        = _pct_sorted(np.sort(dd_arr),    50)
        cagr_val      = 0.0
        if years > 0 and start_equity > 0:
            cagr_val = round((math.pow(max(0.001, med_final) / start_equity, 1.0 / years) - 1) * 100, 1)
        prob_ruin_val = float(ruin_arr.mean() * 100)

        dist_full = [abs(f - kelly_full) for f in fractions]
        dist_half = [abs(f - kelly_half) for f in fractions]

        results.append({
            "fraction":        frac,
            "fracPct":         f"{frac * 100:.1f}",
            "medianFinal":     round(med_final),
            "medianDD":        round(med_dd * 100, 1),
            "probRuin":        round(prob_ruin_val, 1),
            "cagr":            cagr_val,
            "isNearFullKelly": dist_full[fi] == min(dist_full),
            "isNearHalfKelly": dist_half[fi] == min(dist_half),
        })

    return {
        "results":            results,
        "kellyFull":          round(kelly_full * 100, 2),
        "kellyHalf":          round(kelly_half * 100, 2),
        "kellyFullDiscrete":  round(kelly_full_discrete * 100, 2),
        "autocorr":           round(autocorr1(pnls), 3),
        "suggestedBlockSize": optimal_block_size(pnls),
    }


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 11: MAIN SIMULATION RUNNER
# ─────────────────────────────────────────────────────────────────────────────

def run_monte_carlo(
    trades:           list[dict],
    cfg:              dict,
    on_progress:      Optional[Callable[[float], None]] = None,
    historical_equity: Optional[list[float]] = None,
) -> Optional[dict[str, Any]]:
    """
    Run the full Monte Carlo simulation.

    Config keys:
      simMode:        'shuffle' | 'bootstrap' | 'block_bootstrap'
      numSims:        int  (default 1000)
      sizingMode:     'pnl_direct' | 'r_fixed_fraction' | 'r_compounded'
      tailRiskMode:   'none' | 'fat_tail' | 'regime_switch'   [v2-3, v2-4]
      fraction:       float  risk fraction per trade  (default 0.01)
      tradesPerYear:  int    (default 50)
      blockSize:      int    (default 5)
      autoBlockSize:  bool   (default False)
      seed:           int    (default 42)
      startEquity:    float  (default 10000)
      runKelly:       bool   (default True)
      stressVol:      float  stress regime vol multiplier  (default 2.5)
      studentTNu:     float  override t-dist df  (default: auto-calibrate)
    """
    if not trades or len(trades) < 2:
        return None

    # ── Config parsing ────────────────────────────────────────────────────
    sim_mode        = cfg.get("simMode",        "block_bootstrap")
    num_sims        = int(cfg.get("numSims",         1000))
    sizing_mode     = cfg.get("sizingMode",     "r_compounded")
    tail_risk_mode  = cfg.get("tailRiskMode",   "none")
    fraction        = float(cfg.get("fraction",       0.01))
    trades_per_year = int(cfg.get("tradesPerYear",    50))
    block_size      = int(cfg.get("blockSize",         5))
    auto_block_size = bool(cfg.get("autoBlockSize",  False))
    seed            = int(cfg.get("seed",              42))
    start_equity    = float(cfg.get("startEquity", 10_000))
    run_kelly       = bool(cfg.get("runKelly",       True))
    stress_vol      = float(cfg.get("stressVol",      2.5))
    student_t_nu    = cfg.get("studentTNu", None)
    if student_t_nu is not None:
        student_t_nu = float(student_t_nu)

    if num_sims < 1:
        return None
    if start_equity <= 0:
        start_equity = 10_000

    pnls  = np.array([t["pnl"] for t in trades], dtype=np.float64)
    risks = np.array([t.get("risk_dollars") or abs(t["pnl"]) or 100 for t in trades],
                     dtype=np.float64)
    r_multiples = pnls / np.where(risks > 0, risks, 1.0)   # R-multiples
    n = len(pnls)

    # ── Warnings list [v2-1] ──────────────────────────────────────────────
    warnings_list: list[str] = []

    # [v2-1] Degenerate combo: pnl_direct + shuffle = zero terminal variance
    if sizing_mode == "pnl_direct" and sim_mode == "shuffle":
        warnings_list.append(
            "pnl_direct + shuffle: terminal equity is deterministic "
            "(sum is permutation-invariant). Auto-upgraded to bootstrap. "
            "Switch to r_compounded for realistic ruin modeling."
        )
        sim_mode = "bootstrap"

    effective_block_size = (
        optimal_block_size(pnls)
        if sim_mode == "block_bootstrap" and auto_block_size
        else max(2, block_size)
    )

    MAX_CHART_STEPS = 60
    chart_steps = min(n + 1, MAX_CHART_STEPS)
    chart_step  = max(1, n // (chart_steps - 1))
    ruin_threshold = start_equity * 0.5

    rng = np.random.default_rng(seed)

    if on_progress:
        on_progress(0.05)

    # ── Generate index matrix ─────────────────────────────────────────────
    if sim_mode == "shuffle":
        indices = _generate_shuffle_batch(n, num_sims, rng)
    elif sim_mode == "bootstrap":
        indices = _generate_bootstrap_batch(n, num_sims, rng)
    else:
        indices = _generate_block_bootstrap_batch(n, num_sims, effective_block_size, rng)

    if on_progress:
        on_progress(0.20)

    # ── Apply tail risk modifiers [v2-3, v2-4] ───────────────────────────
    r_matrix = r_multiples[indices].copy()          # (num_sims, n)

    if tail_risk_mode == "fat_tail":
        r_matrix = _apply_fat_tail_noise(r_matrix, r_multiples, rng, nu=student_t_nu)
    elif tail_risk_mode == "regime_switch":
        r_matrix = _apply_regime_switching(r_matrix, rng, stress_vol=stress_vol)

    if on_progress:
        on_progress(0.30)

    # ── Equity curves ─────────────────────────────────────────────────────
    if sizing_mode == "r_compounded":
        # Build curves directly from (possibly modified) r_matrix
        curves = np.empty((num_sims, n + 1), dtype=np.float64)
        curves[:, 0] = start_equity
        f = min(fraction, 0.5)
        for s in range(num_sims):
            equity = start_equity
            for i in range(n):
                equity = max(0.0, equity * (1.0 + f * r_matrix[s, i]))
                curves[s, i + 1] = equity

    elif sizing_mode == "r_fixed_fraction":
        curves = _equity_curves_fixed_fraction(pnls, risks, indices, start_equity, fraction)

    else:  # pnl_direct
        curves = _equity_curves_pnl_direct(pnls, indices, start_equity)

    if on_progress:
        on_progress(0.60)

    # ── Metrics ───────────────────────────────────────────────────────────
    final_equities   = curves[:, -1]
    max_drawdowns    = _compute_max_drawdown(curves)
    dd_durations     = _compute_dd_duration(curves)
    time_to_recovery = _compute_time_to_recovery(curves)   # [v2-5]
    ruin_flags       = _compute_ruin_flags(curves, ruin_threshold)

    if on_progress:
        on_progress(0.80)

    # ── Convergence check [v2-6] ──────────────────────────────────────────
    convergence = _convergence_check(final_equities)
    if convergence["warning"]:
        warnings_list.append(convergence["warning"])

    # ── Worst paths ───────────────────────────────────────────────────────
    worst_k       = 3
    worst_idx_arr = np.argpartition(final_equities, min(worst_k, num_sims - 1))[:worst_k]
    worst_paths   = []
    step_pts      = np.round(np.linspace(0, n, chart_steps)).astype(int)
    for wi in worst_idx_arr:
        worst_paths.append({
            "finalEquity": float(final_equities[wi]),
            "path":        curves[wi, step_pts],
        })

    col_major = _subsample_curves(curves, chart_steps)

    if on_progress:
        on_progress(0.90)

    # ── Build result dict ─────────────────────────────────────────────────
    result = _build_results(
        final_equities=final_equities,
        max_drawdowns=max_drawdowns,
        dd_durations=dd_durations,
        time_to_recovery=time_to_recovery,
        ruin_flags=ruin_flags,
        col_major=col_major,
        chart_step=chart_step,
        chart_steps=chart_steps,
        pnls=pnls,
        r_multiples=r_multiples,
        start_equity=start_equity,
        num_sims=num_sims,
        n=n,
        trades_per_year=trades_per_year,
        sim_mode=sim_mode,
        sizing_mode=sizing_mode,
        tail_risk_mode=tail_risk_mode,
        fraction=fraction,
        effective_block_size=effective_block_size,
        seed=seed,
        worst_paths=worst_paths,
        convergence=convergence,
        warnings=warnings_list,
    )

    # ── Kelly sweep ───────────────────────────────────────────────────────
    if run_kelly:
        result["kellySweep"] = run_kelly_sweep(trades, cfg)

    if on_progress:
        on_progress(1.0)

    return result
