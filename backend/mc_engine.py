"""
mc_engine.py  — EyZonCharts Monte Carlo Risk Engine  v4.0
─────────────────────────────────────────────────────────────────────────────
v4 CHANGES (drawdown-dependent position sizing):

  [v4-1]  NEW SIZING MODE: r_dd_scaled
          Implements a continuous drawdown scaler g(DD_t) that multiplies
          the base risk fraction f0, reducing exposure automatically when
          the account is underwater.

          Risk scaling function:
              f_t = f0 · g(DD_t)

              g(DD) = 1                          if DD_t < dd1
              g(DD) = (dd2 - DD) / (dd2 - dd1)  if dd1 ≤ DD_t < dd2
              g(DD) = f_min_scale                if DD_t ≥ dd2

          where:
              DD_t        = 1 − E_t / E_peak_t    (running drawdown ∈ [0, 1))
              f_min_scale = floor of g() ∈ (0, 1] (default 0.25)
              dd1         = drawdown level where scaling begins (default 0.10)
              dd2         = drawdown level where floor kicks in (default 0.30)

          WHY a continuous linear ramp (not a step function):
          • Step functions create cliff-edge behavior — a single bad trade
            discontinuously halves the risk, causing mean-reversion artefacts
            in simulated equity paths that don't exist in live trading.
          • The linear ramp between dd1 and dd2 is smooth and proportional,
            mirroring how systematic managers actually de-risk under drawdown
            (e.g., Turtle-style position scaling, CTA drawdown rules).
          • Floor f_min_scale > 0 ensures a recovery path always exists.
            Zero sizing = zero expected growth = guaranteed permanent ruin.

          WHY drawdown against RUNNING PEAK (not start equity):
          • Using start equity conflates two distinct concepts:
              "down from best achieved" (drawdown) vs
              "down from initial investment" (absolute loss)
          • The running peak is correct for sizing rules because it captures
            the erosion of realized gains, not just the initial stake.

  [v4-2]  DDScaleParams frozen dataclass
          All four dd-scaling parameters bundled into a typed, validated
          struct. Raises ValueError at construction if invariants are broken.
          No magic constants anywhere in the equity walk loop.

  [v4-3]  FRACTION MATRIX
          _equity_curves_dd_scaled() returns a (num_sims, n) matrix of
          realized fractions alongside the equity curves. Enables exact
          per-path, per-trade attribution of sizing decisions.

  [v4-4]  DD SCALING METRICS (result["ddScaling"])
          Three new metrics when sizingMode='r_dd_scaled':
            avgScalerValue:    Mean g(DD_t) across all (sim, trade) pairs.
            fracTradesReduced: % of (sim, trade) pairs where f_t < f0.
            baseline/scaled:   Side-by-side comparison on IDENTICAL paths.

          WHY identical paths for comparison:
          • Same r_matrix for both runs eliminates sampling noise. Any
            outcome difference is purely attributable to the sizing policy.

  [v4-5]  HARD CONSTRAINT PRESERVED
          f·R ≥ -1 clamp [v3-3] uses f0 (the maximum possible fraction).
          Since f_t ≤ f0 always, this is the correct conservative bound.

─────────────────────────────────────────────────────────────────────────────
v3 changes (R-multiple refactor) and prior v2 fixes retained unchanged.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Callable, Optional

import numpy as np
from scipy import stats as scipy_stats


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 0: R-MULTIPLE VALIDATION  [v3-1, v3-2]
# ─────────────────────────────────────────────────────────────────────────────

class RMultipleError(ValueError):
    """
    Raised when trade data cannot be safely converted to R-multiples.
    Always a loud failure — never a silent proxy substitution.
    """
    pass


def _require_r_multiples(trades: list[dict], sizing_mode: str) -> np.ndarray:
    """
    Convert trades to R-multiples with strict validation.

    pnl_direct      → returns raw pnls (not R-multiples).
    all other modes → risk_dollars MUST be present and > 0.
                      Raises RMultipleError immediately on any violation.
    """
    if sizing_mode == "pnl_direct":
        return np.array([t["pnl"] for t in trades], dtype=np.float64)

    r_vals: list[float] = []
    for idx, trade in enumerate(trades):
        pnl          = float(trade["pnl"])
        risk_dollars = trade.get("risk_dollars")

        if risk_dollars is None:
            raise RMultipleError(
                f"Trade index {idx} (pnl={pnl}) is missing 'risk_dollars'. "
                f"Required when sizingMode='{sizing_mode}'. "
                f"Use sizingMode='pnl_direct' only if per-trade risk is undefined."
            )
        risk_dollars = float(risk_dollars)
        if risk_dollars <= 0:
            raise RMultipleError(
                f"Trade index {idx} (pnl={pnl}) has risk_dollars={risk_dollars} ≤ 0. "
                f"Risk must be a strictly positive dollar amount."
            )
        r_vals.append(pnl / risk_dollars)

    return np.array(r_vals, dtype=np.float64)


def _assert_r_distribution(
    r_multiples: np.ndarray,
    pnls:        np.ndarray,
    label:       str = "",
) -> None:
    """Three-check R-multiple sanity suite. [v3-5]"""
    prefix = f"[{label}] " if label else ""

    mean_r = float(r_multiples.mean())
    assert math.isfinite(mean_r), (
        f"{prefix}R-multiple mean not finite ({mean_r}). "
        f"Check for NaN/zero risk_dollars."
    )
    if len(r_multiples) > 1:
        var_r = float(r_multiples.var(ddof=1))
        assert var_r > 0, (
            f"{prefix}R-multiple variance is exactly zero — all R = {r_multiples[0]:.4f}. "
            f"risk_dollars was likely set to abs(pnl), a circular proxy."
        )
    mean_pnl = float(pnls.mean())
    if mean_pnl != 0.0 and mean_r != 0.0:
        assert (mean_r > 0) == (mean_pnl > 0), (
            f"{prefix}R mean ({mean_r:.4f}) and PnL mean ({mean_pnl:.4f}) have "
            f"opposite signs — indicates a risk_dollars sign error."
        )


def _clamp_r_for_fraction(r_matrix: np.ndarray, fraction: float) -> np.ndarray:
    """
    Enforce hard constraint: f · R_t ≥ −1  ∀ (s, t).  [v3-3, v4-5]

    Ensures (1 + f·R_t) ≥ 0, so equity never goes negative from one trade.
    For r_dd_scaled we clamp at f0 (the maximum fraction) — conservative. [v4-5]
    """
    lower_bound = -1.0 / max(fraction, 1e-9)
    return np.clip(r_matrix, lower_bound, None)


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 1: STATISTICS
# ─────────────────────────────────────────────────────────────────────────────

def _pct_sorted(sorted_arr: np.ndarray, p: float) -> float:
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


def optimal_block_size(series: np.ndarray) -> int:
    """Lahiri (1999): b ≈ n^(1/3) × (1 + |ρ|), clamped to [2, n//3]."""
    n   = len(series)
    rho = autocorr1(series)
    raw = round(n ** (1 / 3) * (1 + abs(rho)))
    return max(2, min(n // 3, raw))


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 3: INDEX GENERATORS
# ─────────────────────────────────────────────────────────────────────────────

def _generate_shuffle_batch(n: int, num_sims: int, rng: np.random.Generator) -> np.ndarray:
    return rng.random((num_sims, n)).argsort(axis=1).astype(np.int32)


def _generate_bootstrap_batch(n: int, num_sims: int, rng: np.random.Generator) -> np.ndarray:
    return rng.integers(0, n, size=(num_sims, n), dtype=np.int32)


def _generate_block_bootstrap_batch(
    n: int, num_sims: int, block_size: int, rng: np.random.Generator,
) -> np.ndarray:
    """Overlapping Circular Block Bootstrap (Politis & Romano, 1992)."""
    b        = max(2, min(block_size, n // 2))
    idx      = np.empty((num_sims, n), dtype=np.int32)
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
    pnls: np.ndarray, indices: np.ndarray, start_equity: float,
) -> np.ndarray:
    """
    E_{t+1} = E_t + PnL_t  (no risk normalisation).
    WARNING: deterministic terminal equity under shuffle (sum invariant).
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
# LAYER 4B: EQUITY WALK — r_fixed_fraction (deprecated v1)
# ─────────────────────────────────────────────────────────────────────────────

def _equity_curves_fixed_fraction(
    r_multiples: np.ndarray, indices: np.ndarray, start_equity: float, fraction: float,
) -> np.ndarray:
    """Additive equity-scaled walk. DEPRECATED: prefer r_compounded."""
    num_sims, n  = indices.shape
    curves       = np.empty((num_sims, n + 1), dtype=np.float64)
    curves[:, 0] = start_equity
    f = min(fraction, 0.5)
    for s in range(num_sims):
        equity = start_equity
        for i in range(n):
            equity = max(0.0, equity + equity * f * r_multiples[indices[s, i]])
            curves[s, i + 1] = equity
    return curves


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 4C: EQUITY WALK — r_compounded  [v2-2, v3-3]  ← DEFAULT
# ─────────────────────────────────────────────────────────────────────────────

def _equity_curves_compounded(
    r_matrix: np.ndarray, start_equity: float, fraction: float,
) -> np.ndarray:
    """
    True geometric compounding:  E_{t+1} = E_t × (1 + f × R_t)

    WHY multiplicative: log-wealth is additive (correct objective for
    long-run growth per Kelly). Captures recovery asymmetry: a 50% loss
    requires a 100% gain to recover, not another 50% gain.

    Constraint f·R_t ≥ -1 enforced upstream by _clamp_r_for_fraction().
    f capped at 0.5 to prevent single-trade wipeout.
    """
    num_sims, n  = r_matrix.shape
    curves       = np.empty((num_sims, n + 1), dtype=np.float64)
    curves[:, 0] = start_equity
    f = min(fraction, 0.5)
    for s in range(num_sims):
        equity = start_equity
        for i in range(n):
            equity = max(0.0, equity * (1.0 + f * r_matrix[s, i]))
            curves[s, i + 1] = equity
    return curves


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 4D: DRAWDOWN-DEPENDENT SIZING  [v4-1 through v4-5]
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class DDScaleParams:
    """
    Parameters for the piecewise-linear drawdown risk scaler g(DD).  [v4-2]

    Attributes
    ----------
    dd1 : float
        Drawdown fraction in (0, 1) below which g = 1 (no scaling).
        E.g. 0.10 = scaling begins when account is 10% below its peak.
    dd2 : float
        Drawdown fraction in (dd1, 1] at which g reaches its floor.
        E.g. 0.30 = floor kicks in when account is 30% below its peak.
    f_min_scale : float
        Floor of g(), in (0, 1]. The realized fraction at DD ≥ dd2 is
        f0 × f_min_scale.  Must be > 0: zero eliminates the recovery path.
    """
    dd1:         float = 0.10
    dd2:         float = 0.30
    f_min_scale: float = 0.25

    def __post_init__(self) -> None:
        if not (0.0 < self.dd1 < self.dd2 <= 1.0):
            raise ValueError(
                f"DDScaleParams requires 0 < dd1 < dd2 ≤ 1. "
                f"Got dd1={self.dd1}, dd2={self.dd2}."
            )
        if not (0.0 < self.f_min_scale <= 1.0):
            raise ValueError(
                f"DDScaleParams requires f_min_scale ∈ (0, 1]. "
                f"Got {self.f_min_scale}. Use a small positive value, not 0 — "
                f"zero sizing eliminates the recovery path."
            )


def _dd_scaler(dd: float, p: DDScaleParams) -> float:
    """
    Pure function: current drawdown → risk scaler g(DD) ∈ [f_min_scale, 1].

    Piecewise-linear definition:

        Zone 1  DD < dd1:
            g = 1.0                                 (no scaling — account near peak)

        Zone 2  dd1 ≤ DD < dd2:
            g = f_min_scale + (dd2 - DD)/(dd2 - dd1) × (1 - f_min_scale)

            Derivation:
              ramp = (dd2 - DD) / (dd2 - dd1)   ∈ [0, 1]
              At DD=dd1: ramp=1 → g = f_min_scale + 1×(1-f_min_scale) = 1     ✓
              At DD=dd2: ramp=0 → g = f_min_scale + 0×(1-f_min_scale) = f_min ✓
              Linear interpolation between [f_min_scale, 1.0] over the ramp width.

        Zone 3  DD ≥ dd2:
            g = f_min_scale                         (deep drawdown floor)

    The function is C0-continuous: g(dd1⁻) = g(dd1⁺) = 1,
    g(dd2⁻) = g(dd2⁺) = f_min_scale.
    """
    if dd < p.dd1:
        # Zone 1: full risk — account is above the scaling threshold
        return 1.0
    elif dd < p.dd2:
        # Zone 2: linear de-risking ramp
        #   ramp ∈ [0, 1] → maps to g ∈ [f_min_scale, 1.0]
        ramp = (p.dd2 - dd) / (p.dd2 - p.dd1)
        return p.f_min_scale + ramp * (1.0 - p.f_min_scale)
    else:
        # Zone 3: floor — account in deep drawdown, minimum sizing
        return p.f_min_scale


def _equity_curves_dd_scaled(
    r_matrix:     np.ndarray,    # (num_sims, n)  R-multiples, clamped at f0
    start_equity: float,
    f0:           float,         # base risk fraction (before scaling)
    p:            DDScaleParams,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Drawdown-dependent geometric equity walk.  [v4-1, v4-3]

    At each step t, the realized fraction f_t is computed from the
    current running drawdown DD_t:

        E_peak_t = max(E_0, E_1, ..., E_t)          (running equity peak)
        DD_t     = 1 − E_t / E_peak_t               (∈ [0, 1))
        g_t      = _dd_scaler(DD_t, p)              (∈ [f_min_scale, 1.0])
        f_t      = f0 × g_t                          (realized fraction)
        E_{t+1}  = E_t × (1 + f_t × R_t)           (geometric update)

    Note on peak update timing:
        E_peak is updated BEFORE computing the fraction for trade t. This
        reflects "the best equity achieved before this trade executes",
        which is the correct causal ordering: the sizing decision is made
        at the start of the trade based on where the account stands.

    Parameters
    ----------
    r_matrix : (num_sims, n)
        Resampled R-multiples, clamped against f0. [v4-5]
    f0 : float
        Base risk fraction, capped internally at 0.5.
    p : DDScaleParams
        Scaling thresholds and floor. No magic constants.

    Returns
    -------
    curves : (num_sims, n+1)  float64
        Equity paths, starting equity at index 0.
    fraction_matrix : (num_sims, n)  float64
        Realized risk fraction f_t at every (simulation, trade) step.
        Enables per-path attribution of the sizing policy. [v4-3]
    """
    num_sims, n = r_matrix.shape
    f0_capped   = min(f0, 0.5)      # same cap as r_compounded

    curves          = np.empty((num_sims, n + 1), dtype=np.float64)
    fraction_matrix = np.empty((num_sims, n),     dtype=np.float64)
    curves[:, 0]    = start_equity

    for s in range(num_sims):
        equity = start_equity
        e_peak = start_equity    # tracks running equity peak

        for i in range(n):
            # ── Update peak BEFORE sizing decision ────────────────────────
            # e_peak reflects "best equity going into this trade"
            e_peak = max(equity, e_peak)

            # ── Current drawdown DD_t = 1 − E_t / E_peak_t ───────────────
            # Guard: if equity = 0 (ruin), DD = 1 → g = f_min_scale
            dd_t = 1.0 - equity / e_peak if e_peak > 0.0 else 1.0

            # ── Realized fraction: f_t = f0 × g(DD_t) ────────────────────
            f_t = f0_capped * _dd_scaler(dd_t, p)

            # Record for attribution metrics [v4-3]
            fraction_matrix[s, i] = f_t

            # ── Geometric equity update: E_{t+1} = E_t × (1 + f_t × R_t) ─
            # max(0, ...) is a floating-point safety floor only:
            # with f_t ≤ f0 and R_t ≥ -1/f0 (clamped), (1 + f_t·R_t) ≥ 0
            # in exact arithmetic.
            equity = max(0.0, equity * (1.0 + f_t * r_matrix[s, i]))
            curves[s, i + 1] = equity

    return curves, fraction_matrix


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 4E: DD SCALING METRICS  [v4-4]
# ─────────────────────────────────────────────────────────────────────────────

def _compute_dd_scale_metrics(
    fraction_matrix:  np.ndarray,   # (num_sims, n)  realized fractions
    f0:               float,         # base fraction (reference for scaler value)
    curves_scaled:    np.ndarray,   # (num_sims, n+1)  dd-scaled equity paths
    r_matrix:         np.ndarray,   # (num_sims, n)   same resampled R-multiples
    start_equity:     float,
    trades_per_year:  int,
    n:                int,
) -> dict[str, Any]:
    """
    Attribution metrics for the drawdown scaling policy.  [v4-4]

    All comparisons use the SAME r_matrix for both baseline and scaled
    runs — sampling variance is zero between the two, so every observed
    difference is purely due to the sizing rule.

    Metrics
    -------
    avgScalerValue : float ∈ [f_min_scale, 1.0]
        Mean g(DD_t) = mean(f_t) / f0 across all (sim, trade) pairs.
        Interpretation:
          1.0          → scaling never triggered (account never in drawdown)
          f_min_scale  → account permanently at the floor
          Between      → partial de-risking on average

    fracTradesReduced : float [0, 100]
        Percentage of (sim, trade) pairs where f_t < f0.
        Equivalently: the fraction of trades where DD_t ≥ dd1.

    baseline / scaled : dict
        Key risk/return metrics compared side-by-side:
          medianDD, p75DD, p95DD, cagr, medRecovery
        Expected validation outcomes:
          • Worst-case DD decreases    (main benefit of the policy)
          • Recovery time may increase (de-risked account earns less)
          • Median CAGR decreases slightly (cost of the insurance)
    """
    f0_capped = min(f0, 0.5)

    # ── Average scaler value ḡ = mean(f_t) / f0 ──────────────────────────
    avg_f       = float(fraction_matrix.mean())
    avg_g_value = avg_f / f0_capped if f0_capped > 0.0 else 1.0

    # ── Fraction of trades under reduced sizing ───────────────────────────
    # f_t < f0_capped means the scaler was active (DD ≥ dd1)
    eps              = f0_capped * 1e-9      # float equality guard
    n_reduced        = int((fraction_matrix < f0_capped - eps).sum())
    frac_reduced_pct = float(n_reduced / max(fraction_matrix.size, 1) * 100.0)

    # ── Baseline: constant f0 on identical paths ──────────────────────────
    baseline_curves = _equity_curves_compounded(r_matrix, start_equity, f0_capped)

    # ── Drawdown comparison ───────────────────────────────────────────────
    dd_b = _compute_max_drawdown(baseline_curves)
    dd_s = _compute_max_drawdown(curves_scaled)

    dd_b_med, dd_b_p75, dd_b_p95 = _multi_pct(dd_b, [50, 75, 95])
    dd_s_med, dd_s_p75, dd_s_p95 = _multi_pct(dd_s, [50, 75, 95])

    # ── CAGR comparison ───────────────────────────────────────────────────
    years = n / max(1, trades_per_year)

    def _cagr_arr(curves: np.ndarray) -> float:
        fe    = curves[:, -1]
        safe  = np.maximum(fe, 0.001)
        logs  = np.log(safe / max(start_equity, 0.001))
        gm_fe = float(start_equity * math.exp(logs.mean()))
        if years <= 0 or start_equity <= 0:
            return 0.0
        return round((math.pow(max(0.001, gm_fe) / start_equity, 1.0 / years) - 1) * 100, 2)

    cagr_b = _cagr_arr(baseline_curves)
    cagr_s = _cagr_arr(curves_scaled)

    # ── Recovery-time comparison ──────────────────────────────────────────
    rec_b = _compute_time_to_recovery(baseline_curves)
    rec_s = _compute_time_to_recovery(curves_scaled)
    NEVER = np.iinfo(np.int32).max

    def _med_rec(rec: np.ndarray) -> float:
        finite = rec[rec < NEVER]
        return float(np.median(finite)) if len(finite) > 0 else float(n)

    rec_med_b = _med_rec(rec_b)
    rec_med_s = _med_rec(rec_s)

    # ── Validation assertions ─────────────────────────────────────────────
    # These encode the EXPECTED behavior of a drawdown scaler:
    #   • Worst-case drawdowns decrease  (the main point of de-risking)
    #   • Recovery may take longer       (lower f → slower equity recovery)
    #   • CAGR decreases slightly        (insurance cost)
    # If worstDdImproved is False the scaler parameters may need tuning
    # (e.g. dd2 too high, f_min_scale too close to 1.0).
    validation = {
        "worstDdImproved": bool(dd_s_p95 <= dd_b_p95),
        "medDdImproved":   bool(dd_s_med <= dd_b_med),
        "recoveryDelta":   round(rec_med_s - rec_med_b, 1),   # positive = longer recovery
        "cagrCost":        round(cagr_b - cagr_s, 2),          # positive = cost of policy
    }

    return {
        "avgScalerValue":    round(avg_g_value,      4),
        "fracTradesReduced": round(frac_reduced_pct, 2),
        "baseline": {
            "medianDD":    round(dd_b_med * 100, 2),
            "p75DD":       round(dd_b_p75 * 100, 2),
            "p95DD":       round(dd_b_p95 * 100, 2),
            "cagr":        cagr_b,
            "medRecovery": round(rec_med_b, 1),
        },
        "scaled": {
            "medianDD":    round(dd_s_med * 100, 2),
            "p75DD":       round(dd_s_p75 * 100, 2),
            "p95DD":       round(dd_s_p95 * 100, 2),
            "cagr":        cagr_s,
            "medRecovery": round(rec_med_s, 1),
        },
        "validation": validation,
    }


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 5: TAIL RISK MODIFIERS  [v2-3, v2-4]
# ─────────────────────────────────────────────────────────────────────────────

def _calibrate_student_t_nu(returns: np.ndarray) -> float:
    if len(returns) < 8:
        return 5.0
    kurt = float(scipy_stats.kurtosis(returns, fisher=True))
    if kurt <= 0:
        return 30.0
    nu = 6.0 / kurt + 4.0
    return float(np.clip(nu, 3.0, 30.0))


def _apply_fat_tail_noise(
    r_matrix: np.ndarray, returns: np.ndarray,
    rng: np.random.Generator, nu: Optional[float] = None,
) -> np.ndarray:
    """Student-t noise scaled to match empirical std. Preserves mean."""
    if nu is None:
        nu = _calibrate_student_t_nu(returns)
    num_sims, n = r_matrix.shape
    emp_std     = float(returns.std(ddof=1)) if len(returns) > 1 else 1.0
    t_std       = math.sqrt(nu / (nu - 2)) if nu > 2 else 1.0
    alpha       = emp_std / max(t_std, 1e-9)
    raw_noise   = rng.standard_t(df=nu, size=(num_sims, n))
    noise_std   = float(raw_noise.std()) or 1.0
    factors     = 1.0 + alpha * (raw_noise / noise_std)
    return r_matrix * factors


def _apply_regime_switching(
    r_matrix: np.ndarray, rng: np.random.Generator,
    stress_vol: float = 2.5,
    p_normal_to_stress: float = 0.05,
    p_stress_to_normal: float = 0.20,
) -> np.ndarray:
    """Two-state Markov regime model: amplifies deviations from mean in stress."""
    num_sims, n = r_matrix.shape
    result      = r_matrix.copy()
    mean_r      = float(r_matrix.mean())
    for s in range(num_sims):
        state = 0
        row   = result[s]
        for i in range(n):
            u = rng.random()
            if state == 0 and u < p_normal_to_stress:
                state = 1
            elif state == 1 and u < p_stress_to_normal:
                state = 0
            if state == 1:
                row[i] = mean_r + (row[i] - mean_r) * stress_vol
    return result


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 6: DRAWDOWN METRICS  (vectorised)
# ─────────────────────────────────────────────────────────────────────────────

def _compute_max_drawdown(curves: np.ndarray) -> np.ndarray:
    running_max = np.maximum.accumulate(curves, axis=1)
    safe_max    = np.where(running_max > 0, running_max, 1.0)
    return ((running_max - curves) / safe_max).max(axis=1)


def _compute_dd_duration(curves: np.ndarray) -> np.ndarray:
    running_max   = np.maximum.accumulate(curves, axis=1)
    in_dd         = (curves < running_max).astype(np.int8)
    padded        = np.pad(in_dd, ((0, 0), (1, 1)), constant_values=0)
    diff          = np.diff(padded.astype(np.int16), axis=1)
    max_durations = np.zeros(curves.shape[0], dtype=np.int32)
    for s in range(curves.shape[0]):
        row    = diff[s]
        starts = np.where(row ==  1)[0]
        ends   = np.where(row == -1)[0]
        if len(starts) > 0 and len(ends) == len(starts):
            max_durations[s] = int((ends - starts).max())
    return max_durations


def _compute_ruin_flags(curves: np.ndarray, ruin_threshold: float) -> np.ndarray:
    return (curves.min(axis=1) < ruin_threshold).astype(np.uint8)


def _compute_time_to_recovery(curves: np.ndarray) -> np.ndarray:
    """[v2-5] Trades from max-DD trough back to new equity high."""
    num_sims, T = curves.shape
    NEVER       = np.iinfo(np.int32).max
    recovery    = np.full(num_sims, NEVER, dtype=np.int32)
    for s in range(num_sims):
        path        = curves[s]
        running_max = np.maximum.accumulate(path)
        dd_series   = running_max - path
        trough_idx  = int(np.argmax(dd_series))
        if dd_series[trough_idx] == 0:
            recovery[s] = 0
            continue
        peak_val = float(running_max[trough_idx])
        for t in range(trough_idx + 1, T):
            if path[t] >= peak_val:
                recovery[s] = t - trough_idx
                break
    return recovery


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 7: CHART SUBSAMPLING
# ─────────────────────────────────────────────────────────────────────────────

def _subsample_curves(curves: np.ndarray, chart_steps: int) -> np.ndarray:
    _, T         = curves.shape
    step_indices = np.round(np.linspace(0, T - 1, chart_steps)).astype(int)
    return curves[:, step_indices].T.copy()


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 8: CONVERGENCE CHECK  [v2-6]
# ─────────────────────────────────────────────────────────────────────────────

def _convergence_check(final_equities: np.ndarray, threshold: float = 0.05) -> dict[str, Any]:
    n_half     = max(1, len(final_equities) // 2)
    med_half   = float(np.median(final_equities[:n_half]))
    med_full   = float(np.median(final_equities))
    rel_change = abs(med_full - med_half) / max(abs(med_half), 1.0)
    converged  = rel_change <= threshold
    return {
        "converged":      converged,
        "relativeChange": round(rel_change, 4),
        "medianAtHalf":   round(med_half, 2),
        "medianAtFull":   round(med_full, 2),
        "warning": None if converged else (
            f"Median equity shifted {rel_change*100:.1f}% from first half to "
            f"full sample. Increase numSims for stable estimates."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 9: RESULT AGGREGATION
# ─────────────────────────────────────────────────────────────────────────────

def _build_results(
    final_equities:      np.ndarray,
    max_drawdowns:       np.ndarray,
    dd_durations:        np.ndarray,
    time_to_recovery:    np.ndarray,
    ruin_flags:          np.ndarray,
    col_major:           np.ndarray,
    chart_step:          int,
    chart_steps:         int,
    pnls:                np.ndarray,
    r_multiples:         np.ndarray,
    start_equity:        float,
    num_sims:            int,
    n:                   int,
    trades_per_year:     int,
    sim_mode:            str,
    sizing_mode:         str,
    tail_risk_mode:      str,
    fraction:            float,
    effective_block_size: int,
    seed:                int,
    worst_paths:         list[dict],
    convergence:         dict,
    warnings:            list[str],
    dd_scaling:          Optional[dict] = None,   # [v4-4] populated for r_dd_scaled only
) -> dict[str, Any]:

    fe_p5, fe_p25, fe_med, fe_p75, fe_p95 = _multi_pct(final_equities, [5, 25, 50, 75, 95])
    md_p5, md_med, md_p75, md_p95         = _multi_pct(max_drawdowns,  [5, 50, 75, 95])
    dd_med_dur, dd_p75_dur, dd_p95_dur    = _multi_pct(dd_durations.astype(float), [50, 75, 95])
    dd_mean_dur = float(dd_durations.mean())

    NEVER      = np.iinfo(np.int32).max
    finite_rec = time_to_recovery[time_to_recovery < NEVER]
    never_pct  = float((time_to_recovery == NEVER).mean() * 100)
    if len(finite_rec) > 0:
        rec_med, rec_p75, rec_p95 = _multi_pct(finite_rec.astype(float), [50, 75, 95])
    else:
        rec_med = rec_p75 = rec_p95 = float(n)

    prob_below_start = float((final_equities < start_equity).mean() * 100)
    prob_dd30  = float((max_drawdowns >= 0.30).mean() * 100)
    prob_dd40  = float((max_drawdowns >= 0.40).mean() * 100)
    prob_dd50  = float((max_drawdowns >= 0.50).mean() * 100)
    prob_ruin  = float(ruin_flags.mean() * 100)

    sorted_fe  = np.sort(final_equities)
    var_cutoff = max(1, int(math.floor(0.05 * num_sims)))
    var95      = float(sorted_fe[var_cutoff - 1])
    cvar95     = float(sorted_fe[:var_cutoff].mean()) if var_cutoff > 0 else var95

    years = n / max(1, trades_per_year)
    def _cagr(terminal: float) -> float:
        if years <= 0 or start_equity <= 0:
            return 0.0
        return round((math.pow(max(0.001, terminal) / start_equity, 1.0 / years) - 1) * 100, 2)

    safe_fe      = np.maximum(final_equities, 0.001)
    log_ratios   = np.log(safe_fe / max(start_equity, 0.001))
    geom_mean_fe = float(start_equity * math.exp(log_ratios.mean()))
    cagr         = _cagr(geom_mean_fe)

    trade_rets = r_multiples * fraction
    mean_ret   = float(trade_rets.mean())
    std_ret    = float(trade_rets.std(ddof=1)) if len(trade_rets) > 1 else 0.0
    sharpe     = round(mean_ret / std_ret * math.sqrt(trades_per_year), 2) if std_ret > 0 else 0.0
    downside   = trade_rets[trade_rets < 0]
    ds_var     = float((downside ** 2).sum() / len(trade_rets)) if len(downside) > 0 else 0.0
    ds_std     = math.sqrt(ds_var)
    sortino    = round(mean_ret / ds_std * math.sqrt(trades_per_year), 2) if ds_std > 0 else 0.0
    calmar     = round(cagr / (md_med * 100), 2) if md_med > 0 else 0.0

    envelope_data = []
    for t in range(chart_steps):
        c_p5, c_med, c_p95 = _multi_pct(col_major[t], [5, 50, 95])
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

    result: dict[str, Any] = {
        "finalEquity":    {"p5": round(fe_p5, 2), "p25": round(fe_p25, 2),
                           "median": round(fe_med, 2), "p75": round(fe_p75, 2),
                           "p95": round(fe_p95, 2)},
        "maxDrawdown":    {"p5": round(md_p5*100, 2), "median": round(md_med*100, 2),
                           "p75": round(md_p75*100, 2), "p95": round(md_p95*100, 2)},
        "ddDuration":     {"median": round(dd_med_dur, 1), "p75": round(dd_p75_dur, 1),
                           "p95": round(dd_p95_dur, 1), "mean": round(dd_mean_dur, 1)},
        "timeToRecovery": {"median": round(rec_med, 1), "p75": round(rec_p75, 1),
                           "p95": round(rec_p95, 1), "neverPct": round(never_pct, 1)},
        "probBelowStart": round(prob_below_start, 1),
        "probDD30":       round(prob_dd30, 1),
        "probDD40":       round(prob_dd40, 1),
        "probDD50":       round(prob_dd50, 1),
        "probRuin":       round(prob_ruin, 1),
        "var95":          round(var95,  2),
        "cvar95":         round(cvar95, 2),
        "cagr":           cagr,
        "sharpe":         sharpe,
        "sortino":        sortino,
        "calmar":         calmar,
        "envelopeData":   envelope_data,
        "convergence":    convergence,
        "warnings":       warnings,
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

    if dd_scaling is not None:
        result["ddScaling"] = dd_scaling   # [v4-4] only present for r_dd_scaled

    return result


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 10: KELLY SWEEP
# ─────────────────────────────────────────────────────────────────────────────

def run_kelly_sweep(trades: list[dict], cfg: dict) -> dict[str, Any]:
    """
    Rapid sensitivity sweep across a risk-fraction grid.

    The sweep always uses constant-f r_compounded, even when the main
    simulation uses r_dd_scaled. This gives the theoretical Kelly anchor
    for choosing f0 before applying the drawdown scaler.

    f* = μ_R / σ²_R   (continuous Kelly on R-multiples)
    """
    sim_mode        = cfg.get("simMode",       "block_bootstrap")
    sizing_mode     = cfg.get("sizingMode",    "r_compounded")
    trades_per_year = cfg.get("tradesPerYear", 50)
    seed            = cfg.get("seed",          42)
    start_equity    = cfg.get("startEquity",   10_000)
    block_size      = cfg.get("blockSize",     5)

    # r_dd_scaled falls back to r_compounded for the Kelly sweep
    eff_sizing  = "r_compounded" if sizing_mode == "r_dd_scaled" else sizing_mode
    SWEEP_SIMS  = 400
    fractions   = [0.001, 0.002, 0.003, 0.005, 0.007, 0.010, 0.015, 0.020, 0.025, 0.030]

    pnls        = np.array([t["pnl"] for t in trades], dtype=np.float64)
    r_multiples = _require_r_multiples(trades, eff_sizing)
    n           = len(pnls)

    wins   = r_multiples[r_multiples > 0]
    losses = r_multiples[r_multiples < 0]
    p      = len(wins)   / len(r_multiples) if len(r_multiples) > 0 else 0.0
    q      = 1.0 - p
    avg_w  = float(wins.mean())        if len(wins)   > 0 else 0.0
    avg_l  = float(abs(losses.mean())) if len(losses) > 0 else 1.0
    R      = avg_w / max(1.0, avg_l)

    kelly_discrete   = float(np.clip((p * R - q) / R,               0.0, 0.5)) if R > 0 else 0.0
    mu               = float(r_multiples.mean())
    var              = float(r_multiples.var(ddof=1)) if len(r_multiples) > 1 else 0.0
    kelly_continuous = float(np.clip(mu / var,                       0.0, 0.5)) if var > 0 else 0.0

    kelly_full = kelly_continuous
    kelly_half = kelly_full / 2
    years      = n / max(1, trades_per_year)

    results = []
    for fi, frac in enumerate(fractions):
        rng = np.random.default_rng(seed + 1000 + fi * 7919)

        if sim_mode == "shuffle":
            indices = _generate_shuffle_batch(n, SWEEP_SIMS, rng)
        elif sim_mode == "bootstrap":
            indices = _generate_bootstrap_batch(n, SWEEP_SIMS, rng)
        else:
            indices = _generate_block_bootstrap_batch(n, SWEEP_SIMS, max(2, block_size), rng)

        r_matrix  = _clamp_r_for_fraction(r_multiples[indices].copy(), frac)
        curves    = _equity_curves_compounded(r_matrix, start_equity, frac)
        final_arr = curves[:, -1]
        dd_arr    = _compute_max_drawdown(curves)

        med_final     = _pct_sorted(np.sort(final_arr), 50)
        med_dd        = _pct_sorted(np.sort(dd_arr),    50)
        cagr_val      = 0.0
        if years > 0 and start_equity > 0:
            cagr_val = round(
                (math.pow(max(0.001, med_final) / start_equity, 1.0 / years) - 1) * 100, 1
            )

        dist_full = [abs(f - kelly_full) for f in fractions]
        dist_half = [abs(f - kelly_half) for f in fractions]

        results.append({
            "fraction":        frac,
            "fracPct":         f"{frac * 100:.1f}",
            "medianFinal":     round(med_final),
            "medianDD":        round(med_dd * 100, 1),
            "probRuin":        round(float(_compute_ruin_flags(curves, start_equity * 0.5).mean() * 100), 1),
            "cagr":            cagr_val,
            "isNearFullKelly": dist_full[fi] == min(dist_full),
            "isNearHalfKelly": dist_half[fi] == min(dist_half),
        })

    return {
        "results":            results,
        "kellyFull":          round(kelly_full * 100, 2),
        "kellyHalf":          round(kelly_half * 100, 2),
        "kellyFullDiscrete":  round(kelly_discrete   * 100, 2),
        "autocorr":           round(autocorr1(r_multiples), 3),
        "suggestedBlockSize": optimal_block_size(r_multiples),
    }


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 11: MAIN SIMULATION RUNNER
# ─────────────────────────────────────────────────────────────────────────────

def run_monte_carlo(
    trades:            list[dict],
    cfg:               dict,
    on_progress:       Optional[Callable[[float], None]] = None,
    historical_equity: Optional[list[float]] = None,
) -> Optional[dict[str, Any]]:
    """
    Run the full Monte Carlo simulation.

    Config keys (v4 additions):
      sizingMode: now accepts 'r_dd_scaled'          [v4-1]
      dd1:        drawdown level where scaling begins (default 0.10)  [v4-2]
      dd2:        drawdown level where floor kicks in (default 0.30)  [v4-2]
      fMinScale:  floor of g() in (0,1]; f_min = f0×fMinScale (default 0.25) [v4-2]

    All prior config keys (v2–v3) unchanged.
    """
    if not trades or len(trades) < 2:
        return None

    # ── Config parsing ────────────────────────────────────────────────────
    sim_mode        = cfg.get("simMode",        "block_bootstrap")
    num_sims        = int(cfg.get("numSims",          1000))
    sizing_mode     = cfg.get("sizingMode",      "r_compounded")
    tail_risk_mode  = cfg.get("tailRiskMode",    "none")
    fraction        = float(cfg.get("fraction",        0.01))
    trades_per_year = int(cfg.get("tradesPerYear",     50))
    block_size      = int(cfg.get("blockSize",          5))
    auto_block_size = bool(cfg.get("autoBlockSize",   False))
    seed            = int(cfg.get("seed",               42))
    start_equity    = float(cfg.get("startEquity",  10_000))
    run_kelly       = bool(cfg.get("runKelly",        True))
    stress_vol      = float(cfg.get("stressVol",       2.5))
    student_t_nu    = cfg.get("studentTNu", None)
    if student_t_nu is not None:
        student_t_nu = float(student_t_nu)

    # ── [v4-2] Parse DD scaling parameters ───────────────────────────────
    dd_params: Optional[DDScaleParams] = None
    if sizing_mode == "r_dd_scaled":
        dd_params = DDScaleParams(
            dd1         = float(cfg.get("dd1",        0.10)),
            dd2         = float(cfg.get("dd2",        0.30)),
            f_min_scale = float(cfg.get("fMinScale",  0.25)),
        )

    if num_sims < 1:
        return None
    if start_equity <= 0:
        start_equity = 10_000

    # ── [v3-1, v3-2] Extract and validate R-multiples ────────────────────
    pnls        = np.array([t["pnl"] for t in trades], dtype=np.float64)
    r_multiples = _require_r_multiples(trades, sizing_mode)
    n           = len(pnls)

    if sizing_mode != "pnl_direct":
        _assert_r_distribution(r_multiples, pnls, label=f"run_monte_carlo[{sizing_mode}]")

    # ── Warnings ──────────────────────────────────────────────────────────
    warnings_list: list[str] = []

    if sizing_mode == "pnl_direct" and sim_mode == "shuffle":
        warnings_list.append(
            "pnl_direct + shuffle: terminal equity is deterministic "
            "(sum is permutation-invariant). Auto-upgraded to bootstrap."
        )
        sim_mode = "bootstrap"

    if sizing_mode == "pnl_direct":
        warnings_list.append(
            "sizingMode='pnl_direct' does not use R-multiples. Results are "
            "not scale-invariant. Consider sizingMode='r_compounded'."
        )

    effective_block_size = (
        optimal_block_size(r_multiples)
        if sim_mode == "block_bootstrap" and auto_block_size
        else max(2, block_size)
    )

    MAX_CHART_STEPS = 60
    chart_steps    = min(n + 1, MAX_CHART_STEPS)
    chart_step     = max(1, n // (chart_steps - 1))
    ruin_threshold = start_equity * 0.5
    rng            = np.random.default_rng(seed)

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

    # ── Build resampled R-matrix ──────────────────────────────────────────
    r_matrix = r_multiples[indices].copy()          # (num_sims, n)

    if tail_risk_mode == "fat_tail":
        r_matrix = _apply_fat_tail_noise(r_matrix, r_multiples, rng, nu=student_t_nu)
    elif tail_risk_mode == "regime_switch":
        r_matrix = _apply_regime_switching(r_matrix, rng, stress_vol=stress_vol)

    # ── [v3-3 / v4-5] Hard constraint: f·R ≥ -1, clamped at f0 ──────────
    if sizing_mode != "pnl_direct":
        r_matrix = _clamp_r_for_fraction(r_matrix, fraction)

    if on_progress:
        on_progress(0.30)

    # ── Equity curves ─────────────────────────────────────────────────────
    dd_scale_metrics: Optional[dict] = None

    if sizing_mode == "r_dd_scaled":
        assert dd_params is not None
        curves, fraction_matrix = _equity_curves_dd_scaled(
            r_matrix, start_equity, fraction, dd_params
        )
        # [v4-4] Same r_matrix used for both runs → fair policy attribution
        dd_scale_metrics = _compute_dd_scale_metrics(
            fraction_matrix  = fraction_matrix,
            f0               = fraction,
            curves_scaled    = curves,
            r_matrix         = r_matrix,
            start_equity     = start_equity,
            trades_per_year  = trades_per_year,
            n                = n,
        )

    elif sizing_mode == "r_compounded":
        curves = _equity_curves_compounded(r_matrix, start_equity, fraction)

    elif sizing_mode == "r_fixed_fraction":
        curves = _equity_curves_fixed_fraction(r_multiples, indices, start_equity, fraction)

    else:  # pnl_direct
        curves = _equity_curves_pnl_direct(pnls, indices, start_equity)

    if on_progress:
        on_progress(0.60)

    # ── Metrics ───────────────────────────────────────────────────────────
    final_equities   = curves[:, -1]
    max_drawdowns    = _compute_max_drawdown(curves)
    dd_durations     = _compute_dd_duration(curves)
    time_to_recovery = _compute_time_to_recovery(curves)
    ruin_flags       = _compute_ruin_flags(curves, ruin_threshold)

    if on_progress:
        on_progress(0.80)

    convergence = _convergence_check(final_equities)
    if convergence["warning"]:
        warnings_list.append(convergence["warning"])

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
        dd_scaling=dd_scale_metrics,    # None for all non-dd-scaled modes
    )

    if run_kelly:
        result["kellySweep"] = run_kelly_sweep(trades, cfg)

    if on_progress:
        on_progress(1.0)

    return result
