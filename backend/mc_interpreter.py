"""
mc_interpreter.py
─────────────────────────────────────────────────────────────────────────────
Deterministic interpreter for Monte Carlo simulation results.

All thresholds are hard-coded constants defined at module level.
No randomness, no LLM calls, no fuzzy logic.
Every branch is traceable to a specific numeric comparison.

Usage:
    from mc_interpreter import interpret_monte_carlo_results
    insights = interpret_monte_carlo_results(results_json)
"""

from __future__ import annotations
from typing import Any

# ─────────────────────────────────────────────────────────────────────────────
# THRESHOLD CONSTANTS
# All decision boundaries are declared here so they can be audited, versioned,
# and overridden in tests without touching business logic.
# ─────────────────────────────────────────────────────────────────────────────

# ── Ruin ──────────────────────────────────────────────────────────────────────
RUIN_CRITICAL   = 15.0   # % ruin probability → unacceptable
RUIN_HIGH       = 5.0    # % ruin probability → high
RUIN_ELEVATED   = 2.0    # % ruin probability → elevated
RUIN_LOW        = 0.5    # % ruin probability → acceptable

# ── Drawdown thresholds ───────────────────────────────────────────────────────
DD_P95_CATASTROPHIC = 60.0   # % max-DD at P95 → catastrophic tail
DD_P95_SEVERE       = 45.0   # % max-DD at P95 → severe
DD_P95_HIGH         = 30.0   # % max-DD at P95 → high
DD_P95_MODERATE     = 20.0   # % max-DD at P95 → moderate
DD_MEDIAN_HIGH      = 25.0   # % median max-DD → aggressive sizing
DD_MEDIAN_MODERATE  = 15.0   # % median max-DD → elevated sizing

# ── Drawdown distribution instability ────────────────────────────────────────
# Spread = P95_DD − P5_DD. Wide spreads mean the outcome is highly path-dependent.
DD_SPREAD_UNSTABLE  = 35.0   # percentage-points spread → unstable
DD_SPREAD_WIDE      = 20.0   # percentage-points spread → wide
DD_SPREAD_NORMAL    = 10.0   # percentage-points spread → normal

# ── Sizing: over-aggression heuristics ───────────────────────────────────────
# These are checked in combination, not isolation.
PROB_LOSS_CRITICAL  = 50.0   # % prob final equity < start → critical
PROB_LOSS_HIGH      = 35.0   # % prob final equity < start → high
PROB_LOSS_MODERATE  = 20.0   # % prob final equity < start → moderate
PROB_LOSS_LOW       = 10.0   # % prob final equity < start → acceptable

# ── Skew ratio: median / P5 final equity ─────────────────────────────────────
# Ratio >> 1 means the upside case is much better than the downside case,
# which is desirable for positive-expectancy strategies.
# Ratio < 1 would mean median is worse than the 5th-percentile, which is
# mathematically impossible and signals corrupted data.
SKEW_COMPRESSED     = 1.30   # median / P5 < 1.30 → essentially no upside skew
SKEW_MODERATE       = 2.00   # median / P5 < 2.00 → moderate positive skew
SKEW_GOOD           = 3.50   # median / P5 < 3.50 → good asymmetry
# Above SKEW_GOOD: strong positive skew

# ── Calmar ratio ──────────────────────────────────────────────────────────────
CALMAR_STRONG   = 1.0   # Calmar ≥ 1.0 → strong risk-adjusted return
CALMAR_ADEQUATE = 0.5   # Calmar ≥ 0.5 → adequate
CALMAR_WEAK     = 0.2   # Calmar ≥ 0.2 → weak

# ── Sharpe ratio ──────────────────────────────────────────────────────────────
SHARPE_STRONG   = 1.5
SHARPE_ADEQUATE = 0.75
SHARPE_WEAK     = 0.3

# ── Sortino ratio ─────────────────────────────────────────────────────────────
SORTINO_STRONG   = 2.0
SORTINO_ADEQUATE = 1.0

# ── Robustness scoring weights (must sum to 100) ──────────────────────────────
W_RUIN         = 25   # ruin probability is the most critical single factor
W_PROB_LOSS    = 15   # probability of ending below start
W_DD_TAIL      = 20   # P95 max drawdown tail severity
W_DD_STABILITY = 15   # drawdown distribution stability (spread)
W_SKEW         = 10   # median/P5 equity skew (measures edge quality)
W_CALMAR       = 10   # risk-adjusted return quality
W_SHARPE        = 5   # volatility-adjusted return

assert W_RUIN + W_PROB_LOSS + W_DD_TAIL + W_DD_STABILITY + W_SKEW + W_CALMAR + W_SHARPE == 100, \
    "Robustness weights must sum to 100"


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# Each helper returns a (score_0_to_1, label, detail) tuple.
# score = 1.0 means perfect; 0.0 means worst possible for that metric.
# ─────────────────────────────────────────────────────────────────────────────

def _score_ruin(prob_ruin: float) -> tuple[float, str, str]:
    """
    Score the ruin probability (equity ever fell below 50% of start).
    Lower is better. Returns (score, severity_label, detail_string).
    """
    if prob_ruin >= RUIN_CRITICAL:
        return (0.0,
                "CRITICAL",
                f"Ruin probability is {prob_ruin:.1f}%, which exceeds the critical threshold "
                f"of {RUIN_CRITICAL:.0f}%. Current sizing will destroy the account in a "
                f"material fraction of realistic trade-sequence scenarios.")

    elif prob_ruin >= RUIN_HIGH:
        return (0.25,
                "HIGH",
                f"Ruin probability is {prob_ruin:.1f}%, above the high-risk threshold of "
                f"{RUIN_HIGH:.0f}%. The strategy is viable but requires immediate position "
                f"sizing reduction to bring ruin below {RUIN_ELEVATED:.0f}%.")

    elif prob_ruin >= RUIN_ELEVATED:
        return (0.55,
                "ELEVATED",
                f"Ruin probability is {prob_ruin:.1f}%, above the elevated threshold of "
                f"{RUIN_ELEVATED:.0f}%. Consider reducing risk per trade by 20–30%.")

    elif prob_ruin >= RUIN_LOW:
        return (0.80,
                "LOW",
                f"Ruin probability is {prob_ruin:.1f}%, within the acceptable band "
                f"(below {RUIN_HIGH:.0f}%). No immediate action required on sizing.")

    else:
        return (1.0,
                "NEGLIGIBLE",
                f"Ruin probability is {prob_ruin:.1f}%, below {RUIN_LOW:.1f}%. "
                f"Capital preservation risk is negligible at current sizing.")


def _score_prob_loss(prob_loss: float) -> tuple[float, str, str]:
    """
    Score the probability of ending the sequence below starting equity.
    """
    if prob_loss >= PROB_LOSS_CRITICAL:
        return (0.0,
                "CRITICAL",
                f"{prob_loss:.1f}% of simulations end below the starting equity, "
                f"exceeding the critical threshold of {PROB_LOSS_CRITICAL:.0f}%. "
                f"The strategy has negative or near-zero expected value at current sizing.")

    elif prob_loss >= PROB_LOSS_HIGH:
        return (0.25,
                "HIGH",
                f"{prob_loss:.1f}% of simulations end below start (threshold: "
                f"{PROB_LOSS_HIGH:.0f}%). The strategy's edge does not reliably "
                f"overcome sizing costs and variance at this fraction.")

    elif prob_loss >= PROB_LOSS_MODERATE:
        return (0.60,
                "MODERATE",
                f"{prob_loss:.1f}% of simulations end below start. Acceptable for "
                f"short-duration sequences but warrants monitoring over time.")

    elif prob_loss >= PROB_LOSS_LOW:
        return (0.80,
                "LOW",
                f"{prob_loss:.1f}% of simulations end below start. "
                f"Edge is translating into positive outcomes in the majority of paths.")

    else:
        return (1.0,
                "MINIMAL",
                f"{prob_loss:.1f}% of simulations end below start, below the "
                f"low-risk threshold of {PROB_LOSS_LOW:.0f}%. Strong consistency.")


def _score_dd_tail(dd_p5: float, dd_median: float, dd_p95: float) -> tuple[float, str, str]:
    """
    Score the drawdown tail risk using the P95 max drawdown.
    P5 is the best-case scenario; P95 is the worst-case tail.
    """
    if dd_p95 >= DD_P95_CATASTROPHIC:
        return (0.0,
                "CATASTROPHIC",
                f"P95 max drawdown is {dd_p95:.1f}%, which is catastrophic "
                f"(>{DD_P95_CATASTROPHIC:.0f}%). A {dd_p95:.0f}% drawdown requires a "
                f"{100 / (1 - dd_p95/100) - 100:.0f}% gain to recover. "
                f"Median drawdown: {dd_median:.1f}%, best-case (P5): {dd_p5:.1f}%.")

    elif dd_p95 >= DD_P95_SEVERE:
        return (0.20,
                "SEVERE",
                f"P95 max drawdown is {dd_p95:.1f}% (threshold: {DD_P95_SEVERE:.0f}%). "
                f"Tail scenarios involve severe capital impairment. "
                f"Median: {dd_median:.1f}%.")

    elif dd_p95 >= DD_P95_HIGH:
        return (0.50,
                "HIGH",
                f"P95 max drawdown is {dd_p95:.1f}%. In adverse path orderings, "
                f"drawdowns consistently exceed {DD_P95_HIGH:.0f}%. "
                f"Median: {dd_median:.1f}%.")

    elif dd_p95 >= DD_P95_MODERATE:
        return (0.75,
                "MODERATE",
                f"P95 max drawdown is {dd_p95:.1f}%. Tail risk is present but "
                f"within manageable bounds. Median: {dd_median:.1f}%.")

    else:
        return (1.0,
                "LOW",
                f"P95 max drawdown is {dd_p95:.1f}%, below the moderate threshold "
                f"of {DD_P95_MODERATE:.0f}%. Drawdown tail risk is well-controlled. "
                f"Median: {dd_median:.1f}%.")


def _score_dd_stability(dd_p5: float, dd_p95: float) -> tuple[float, str, str]:
    """
    Score the stability of the drawdown distribution using P95 − P5 spread.
    A wide spread means the outcome is highly sensitive to trade ordering —
    indicating that reported results may not be reproducible.
    """
    spread = dd_p95 - dd_p5

    if spread >= DD_SPREAD_UNSTABLE:
        return (0.0,
                "UNSTABLE",
                f"Drawdown spread (P95 − P5) = {spread:.1f} percentage points, "
                f"exceeding the instability threshold of {DD_SPREAD_UNSTABLE:.0f}pp. "
                f"Performance is highly path-dependent: trade ordering alone "
                f"changes max drawdown by {spread:.0f}pp across simulations.")

    elif spread >= DD_SPREAD_WIDE:
        return (0.40,
                "WIDE",
                f"Drawdown spread = {spread:.1f}pp (threshold: {DD_SPREAD_WIDE:.0f}pp). "
                f"Significant sensitivity to trade ordering exists. "
                f"Results should not be presented as deterministic.")

    elif spread >= DD_SPREAD_NORMAL:
        return (0.75,
                "MODERATE",
                f"Drawdown spread = {spread:.1f}pp. Some path-dependency exists "
                f"but within normal bounds for discretionary trading.")

    else:
        return (1.0,
                "STABLE",
                f"Drawdown spread = {spread:.1f}pp, below {DD_SPREAD_NORMAL:.0f}pp. "
                f"The drawdown distribution is consistent across trade orderings.")


def _score_skew(fe_p5: float, fe_median: float, start_equity: float) -> tuple[float, str, str]:
    """
    Score the upside/downside skew using the ratio: fe_median / fe_p5.
    A higher ratio means the median outcome is much better than the worst-5%
    outcome, which reflects a strategy with a meaningful edge and bounded
    downside relative to upside.

    Note: start_equity is used to contextualise both values as return multiples.
    """
    # Guard against fe_p5 = 0 (ruin in worst case)
    if fe_p5 <= 0:
        return (0.0,
                "EXTREME_DOWNSIDE",
                f"P5 final equity is {fe_p5:.0f}, implying ruin in the worst 5% "
                f"of scenarios. Skew ratio is undefined. This is an unacceptable "
                f"risk profile regardless of median performance.")

    ratio = fe_median / fe_p5

    if ratio < SKEW_COMPRESSED:
        return (0.30,
                "COMPRESSED",
                f"Median/P5 equity ratio = {ratio:.2f}x (threshold: {SKEW_COMPRESSED:.2f}x). "
                f"The median outcome ({fe_median:,.0f}) is barely better than the worst-5% "
                f"outcome ({fe_p5:,.0f}). The strategy has minimal upside asymmetry.")

    elif ratio < SKEW_MODERATE:
        return (0.55,
                "MODERATE",
                f"Median/P5 equity ratio = {ratio:.2f}x. Moderate positive skew: "
                f"median outcome ({fe_median:,.0f}) is {ratio:.1f}× the worst-5% "
                f"outcome ({fe_p5:,.0f}).")

    elif ratio < SKEW_GOOD:
        return (0.80,
                "GOOD",
                f"Median/P5 equity ratio = {ratio:.2f}x. Good asymmetry: the median "
                f"outcome significantly outpaces the downside tail.")

    else:
        return (1.0,
                "STRONG",
                f"Median/P5 equity ratio = {ratio:.2f}x. Strong positive skew: "
                f"the median outcome ({fe_median:,.0f}) is {ratio:.1f}× the P5 outcome "
                f"({fe_p5:,.0f}). Indicates robust edge with bounded downside.")


def _score_calmar(calmar: float) -> tuple[float, str, str]:
    """
    Score the Calmar ratio (CAGR / median max drawdown).
    Measures whether the return justifies the drawdown cost.
    """
    if calmar >= CALMAR_STRONG:
        return (1.0,
                "STRONG",
                f"Calmar ratio = {calmar:.2f} (≥{CALMAR_STRONG:.1f}). "
                f"Each unit of median drawdown generates ≥1 unit of annual return.")

    elif calmar >= CALMAR_ADEQUATE:
        return (0.70,
                "ADEQUATE",
                f"Calmar ratio = {calmar:.2f}. Return-to-drawdown trade-off "
                f"is acceptable but not exceptional.")

    elif calmar >= CALMAR_WEAK:
        return (0.40,
                "WEAK",
                f"Calmar ratio = {calmar:.2f}. Insufficient return relative to "
                f"drawdown sustained. Either sizing is too aggressive or edge is weak.")

    elif calmar >= 0:
        return (0.15,
                "VERY_WEAK",
                f"Calmar ratio = {calmar:.2f}. Negligible return per unit of drawdown. "
                f"The strategy is not compensating adequately for capital-at-risk.")

    else:
        return (0.0,
                "NEGATIVE",
                f"Calmar ratio = {calmar:.2f} (negative). CAGR is negative while "
                f"drawdowns are occurring. The strategy is net-destructive.")


def _score_sharpe(sharpe: float) -> tuple[float, str, str]:
    """
    Score the annualised Sharpe ratio (rf = 0 assumption).
    """
    if sharpe >= SHARPE_STRONG:
        return (1.0, "STRONG",
                f"Annualised Sharpe = {sharpe:.2f} (≥{SHARPE_STRONG:.2f}). "
                f"Exceptional risk-adjusted return.")

    elif sharpe >= SHARPE_ADEQUATE:
        return (0.70, "ADEQUATE",
                f"Annualised Sharpe = {sharpe:.2f}. Acceptable risk-adjusted return.")

    elif sharpe >= SHARPE_WEAK:
        return (0.35, "WEAK",
                f"Annualised Sharpe = {sharpe:.2f}. Below-average risk-adjusted return. "
                f"Volatility is high relative to mean return per trade.")

    elif sharpe >= 0:
        return (0.10, "VERY_WEAK",
                f"Annualised Sharpe = {sharpe:.2f}. Near-zero risk-adjusted return.")

    else:
        return (0.0, "NEGATIVE",
                f"Annualised Sharpe = {sharpe:.2f}. Negative risk-adjusted return. "
                f"Mean return per trade is negative.")


def _detect_over_aggressive_sizing(
    prob_loss: float,
    dd_median: float,
    prob_ruin: float,
    calmar: float,
    prob_dd40: float,
    prob_dd50: float,
) -> tuple[bool, str]:
    """
    Determines whether sizing is over-aggressive by combining multiple signals.
    Returns (is_aggressive: bool, explanation: str).

    Over-aggressive sizing is defined as satisfying ANY TWO of:
      1. prob_loss ≥ PROB_LOSS_HIGH
      2. dd_median ≥ DD_MEDIAN_HIGH
      3. prob_ruin ≥ RUIN_HIGH
      4. calmar < CALMAR_WEAK AND calmar >= 0 (returns don't justify drawdowns)
      5. prob_dd40 >= 30% (40%+ drawdown is common, not just a tail event)
      6. prob_dd50 >= 10% (50%+ drawdown is a real possibility)

    OR any ONE CRITICAL trigger:
      A. prob_ruin ≥ RUIN_CRITICAL
      B. prob_loss ≥ PROB_LOSS_CRITICAL
      C. dd_median ≥ DD_MEDIAN_HIGH and prob_ruin ≥ RUIN_ELEVATED
    """
    flags: list[str] = []

    # Soft signals (require two or more)
    if prob_loss >= PROB_LOSS_HIGH:
        flags.append(
            f"loss probability {prob_loss:.1f}% ≥ {PROB_LOSS_HIGH:.0f}%"
        )
    if dd_median >= DD_MEDIAN_HIGH:
        flags.append(
            f"median max DD {dd_median:.1f}% ≥ {DD_MEDIAN_HIGH:.0f}%"
        )
    if prob_ruin >= RUIN_HIGH:
        flags.append(
            f"ruin probability {prob_ruin:.1f}% ≥ {RUIN_HIGH:.0f}%"
        )
    if 0 <= calmar < CALMAR_WEAK:
        flags.append(
            f"Calmar {calmar:.2f} < {CALMAR_WEAK:.1f} (returns don't justify drawdowns)"
        )
    if prob_dd40 >= 30.0:
        flags.append(
            f"P(DD≥40%) = {prob_dd40:.1f}% — severe drawdown is a common outcome"
        )
    if prob_dd50 >= 10.0:
        flags.append(
            f"P(DD≥50%) = {prob_dd50:.1f}% — ruin-level drawdown is non-negligible"
        )

    # Hard critical triggers (one is sufficient)
    critical: list[str] = []
    if prob_ruin >= RUIN_CRITICAL:
        critical.append(
            f"ruin probability {prob_ruin:.1f}% ≥ critical threshold {RUIN_CRITICAL:.0f}%"
        )
    if prob_loss >= PROB_LOSS_CRITICAL:
        critical.append(
            f"loss probability {prob_loss:.1f}% ≥ critical threshold {PROB_LOSS_CRITICAL:.0f}%"
        )
    if dd_median >= DD_MEDIAN_HIGH and prob_ruin >= RUIN_ELEVATED:
        critical.append(
            f"median DD {dd_median:.1f}% combined with ruin probability {prob_ruin:.1f}%"
        )

    if critical:
        return (True,
                f"Sizing is CRITICALLY over-aggressive. Hard trigger(s) breached: "
                f"{'; '.join(critical)}.")

    if len(flags) >= 2:
        return (True,
                f"Sizing is over-aggressive: {len(flags)} soft signals fired simultaneously: "
                f"{'; '.join(flags)}. Reduce risk fraction until fewer than 2 signals trigger.")

    if len(flags) == 1:
        return (False,
                f"One soft sizing signal present: {flags[0]}. "
                f"Sizing is approaching aggressive territory but has not crossed the threshold.")

    return (False,
            f"No over-aggressive sizing signals detected across all {6} heuristics. "
            f"Current sizing is within acceptable bounds given this trade distribution.")


def _compute_robustness_score(
    score_ruin:         float,
    score_prob_loss:    float,
    score_dd_tail:      float,
    score_dd_stability: float,
    score_skew:         float,
    score_calmar:       float,
    score_sharpe:       float,
) -> int:
    """
    Weighted combination of all component scores → integer 0–100.
    Each component score is in [0.0, 1.0].
    Weights are defined at module level and sum to 100.
    """
    raw = (
        score_ruin         * W_RUIN          +
        score_prob_loss    * W_PROB_LOSS      +
        score_dd_tail      * W_DD_TAIL        +
        score_dd_stability * W_DD_STABILITY   +
        score_skew         * W_SKEW           +
        score_calmar       * W_CALMAR         +
        score_sharpe       * W_SHARPE
    )
    return max(0, min(100, round(raw)))


def _generate_recommendation(
    robustness_score:   int,
    is_over_aggressive: bool,
    ruin_label:         str,
    dd_tail_label:      str,
    dd_stability_label: str,
    prob_loss:          float,
    dd_median:          float,
    calmar:             float,
    sharpe:             float,
    sortino:            float,
    cagr:               float,
) -> str:
    """
    Generates a single deterministic recommendation string.
    Priority order:
      1. Catastrophic ruin / loss probability → halt and resize
      2. Over-aggressive sizing → reduce fraction
      3. Unstable drawdown distribution → investigate strategy consistency
      4. Weak risk-adjusted return → review edge or sizing
      5. Passing → maintain with noted conditions
    """
    # Priority 1: halt condition
    if ruin_label == "CRITICAL" or dd_tail_label == "CATASTROPHIC":
        return (
            f"HALT AND RESIZE IMMEDIATELY. "
            f"Ruin severity [{ruin_label}] and drawdown tail [{dd_tail_label}] "
            f"indicate the current position sizing will result in severe capital "
            f"destruction in a non-trivial fraction of realistic scenarios. "
            f"Reduce risk fraction by at least 50% and re-run simulation. "
            f"Do not trade at current sizing."
        )

    # Priority 2: over-aggressive sizing
    if is_over_aggressive:
        # Estimate the reduction multiplier needed to bring key metrics into range
        # Target: dd_median < DD_MEDIAN_MODERATE and prob_loss < PROB_LOSS_MODERATE
        # Kelly sizing implies dd_median scales approximately linearly with fraction
        if dd_median > 0:
            target_reduction = min(1.0, DD_MEDIAN_MODERATE / dd_median)
            reduction_pct = round((1 - target_reduction) * 100)
        else:
            reduction_pct = 25

        return (
            f"REDUCE POSITION SIZING by approximately {reduction_pct}% "
            f"(robustness score: {robustness_score}/100). "
            f"Over-aggressive sizing detected: median max DD = {dd_median:.1f}%, "
            f"loss probability = {prob_loss:.1f}%. "
            f"Target median DD < {DD_MEDIAN_MODERATE:.0f}% and loss probability "
            f"< {PROB_LOSS_MODERATE:.0f}% before increasing trade count or adding capital. "
            f"Current Calmar = {calmar:.2f}; target ≥ {CALMAR_ADEQUATE:.1f}."
        )

    # Priority 3: unstable drawdown distribution
    if dd_stability_label == "UNSTABLE":
        return (
            f"INVESTIGATE STRATEGY CONSISTENCY before scaling. "
            f"Drawdown distribution is unstable (spread label: {dd_stability_label}), "
            f"indicating high path-dependency. Results are not reproducible across "
            f"different trade-sequence orderings. Consider running block bootstrap "
            f"resampling to verify whether autocorrelation in trades is inflating "
            f"the apparent edge. Robustness score: {robustness_score}/100."
        )

    # Priority 4: weak risk-adjusted return
    if calmar < CALMAR_ADEQUATE and cagr > 0:
        return (
            f"REVIEW SIZING OR EDGE QUALITY. "
            f"Strategy generates positive CAGR ({cagr:.1f}%) but insufficient "
            f"return per unit of drawdown (Calmar = {calmar:.2f}, target ≥ {CALMAR_ADEQUATE:.1f}). "
            f"Either reduce position size to lower the denominator (median DD = {dd_median:.1f}%) "
            f"or improve trade selectivity to raise the numerator. "
            f"Sharpe = {sharpe:.2f}, Sortino = {sortino:.2f}. "
            f"Robustness score: {robustness_score}/100."
        )

    if cagr <= 0:
        return (
            f"STRATEGY HAS NEGATIVE EXPECTED CAGR ({cagr:.1f}%). "
            f"No position sizing adjustment will make a negative-expectancy strategy "
            f"profitable. Review trade selection criteria, not sizing. "
            f"Robustness score: {robustness_score}/100."
        )

    # Priority 5: passing with conditions
    conditions: list[str] = []
    if dd_tail_label in ("HIGH", "SEVERE"):
        conditions.append(f"monitor P95 drawdown [{dd_median:.0f}% median]")
    if dd_stability_label == "WIDE":
        conditions.append("consider block bootstrap to validate edge independence")
    if prob_loss >= PROB_LOSS_MODERATE:
        conditions.append(f"loss probability {prob_loss:.1f}% warrants continued monitoring")

    if conditions:
        condition_str = "; ".join(conditions)
        return (
            f"MAINTAIN CURRENT SIZING with the following conditions: {condition_str}. "
            f"Core metrics are within acceptable bounds "
            f"(CAGR {cagr:.1f}%, Calmar {calmar:.2f}, Sharpe {sharpe:.2f}). "
            f"Robustness score: {robustness_score}/100."
        )

    return (
        f"CURRENT SIZING IS ACCEPTABLE. "
        f"All risk metrics are within defined thresholds. "
        f"CAGR {cagr:.1f}%, Calmar {calmar:.2f}, Sharpe {sharpe:.2f}, "
        f"Sortino {sortino:.2f}, median max DD {dd_median:.1f}%, "
        f"loss probability {prob_loss:.1f}%, ruin probability categorised as [{ruin_label}]. "
        f"Robustness score: {robustness_score}/100. "
        f"Review if trade distribution or market regime changes materially."
    )


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

def interpret_monte_carlo_results(results_json: dict[str, Any]) -> dict[str, Any]:
    """
    Deterministic interpreter for Monte Carlo simulation output.

    Parameters
    ----------
    results_json : dict
        Output from the Monte Carlo engine. Expected keys:

        finalEquity : dict
            p5, p25, median, p75, p95 — terminal equity at each percentile

        maxDrawdown : dict
            p5, median, p75, p95 — max drawdown fractions expressed as percentages

        probBelowStart : float
            Percentage of simulations ending below starting equity

        probDD30, probDD40, probDD50 : float
            Probability (%) of experiencing ≥30/40/50% max drawdown

        probRuin : float
            Probability (%) of equity ever falling below 50% of starting value

        var95 : float
            5th-percentile terminal equity (Value-at-Risk)

        cvar95 : float
            Expected terminal equity in the worst-5% outcomes (CVaR)

        cagr : float
            Annualised CAGR from median terminal equity (%)

        sharpe : float
            Annualised Sharpe ratio (rf = 0)

        sortino : float
            Annualised Sortino ratio

        calmar : float
            Calmar ratio (CAGR / median max drawdown)

        metadata : dict
            seed, numSims, simMode, sizingMode, n, tradesPerYear, startEquity (optional)

    Returns
    -------
    dict with keys:
        risk_assessment  : str   — overall risk level with quantitative justification
        sizing_comment   : str   — position sizing evaluation and specific diagnosis
        drawdown_warning : str   — drawdown severity, stability, and tail risk
        robustness_score : int   — 0–100 composite score with component breakdown
        recommendation   : str   — prioritised, actionable instruction
        _debug           : dict  — component scores for auditability (not for display)
    """
    # ── 1. Extract and validate fields ───────────────────────────────────────
    fe          = results_json.get("finalEquity", {})
    md          = results_json.get("maxDrawdown", {})
    ddd         = results_json.get("ddDuration", {})
    meta        = results_json.get("metadata",   {})

    fe_p5       = float(fe.get("p5",     0))
    fe_p25      = float(fe.get("p25",    0))
    fe_median   = float(fe.get("median", 0))
    fe_p75      = float(fe.get("p75",    0))
    fe_p95      = float(fe.get("p95",    0))

    dd_p5       = float(md.get("p5",     0))
    dd_median   = float(md.get("median", 0))
    dd_p75      = float(md.get("p75",    dd_median))
    dd_p95      = float(md.get("p95",    0))

    prob_loss   = float(results_json.get("probBelowStart", 0))
    prob_dd30   = float(results_json.get("probDD30",       0))
    prob_dd40   = float(results_json.get("probDD40",       0))
    prob_dd50   = float(results_json.get("probDD50",       0))
    prob_ruin   = float(results_json.get("probRuin",       0))

    var95       = float(results_json.get("var95",  fe_p5))
    cvar95      = float(results_json.get("cvar95", fe_p5))
    cagr        = float(results_json.get("cagr",   0))
    sharpe      = float(results_json.get("sharpe", 0))
    sortino     = float(results_json.get("sortino", 0))
    calmar      = float(results_json.get("calmar", 0))

    num_sims    = int(meta.get("numSims",       0))
    sim_mode    = str(meta.get("simMode",       "unknown"))
    sizing_mode = str(meta.get("sizingMode",    "unknown"))
    n_trades    = int(meta.get("n",             0))
    tpy         = int(meta.get("tradesPerYear", 0))

    # start_equity may be in metadata or inferred; default to 0 (unknown)
    start_equity = float(meta.get("startEquity", 0))

    # ── 2. Component scoring ──────────────────────────────────────────────────
    s_ruin,  ruin_label,  ruin_detail  = _score_ruin(prob_ruin)
    s_loss,  loss_label,  loss_detail  = _score_prob_loss(prob_loss)
    s_ddt,   ddt_label,   ddt_detail   = _score_dd_tail(dd_p5, dd_median, dd_p95)
    s_dds,   dds_label,   dds_detail   = _score_dd_stability(dd_p5, dd_p95)
    s_skew,  skew_label,  skew_detail  = _score_skew(fe_p5, fe_median, start_equity)
    s_cal,   cal_label,   cal_detail   = _score_calmar(calmar)
    s_sh,    sh_label,    sh_detail    = _score_sharpe(sharpe)

    # ── 3. Over-aggressive sizing detection ──────────────────────────────────
    is_aggressive, sizing_diagnosis = _detect_over_aggressive_sizing(
        prob_loss, dd_median, prob_ruin, calmar, prob_dd40, prob_dd50
    )

    # ── 4. Composite robustness score ────────────────────────────────────────
    robustness_score = _compute_robustness_score(
        s_ruin, s_loss, s_ddt, s_dds, s_skew, s_cal, s_sh
    )

    # ── 5. Risk assessment narrative ─────────────────────────────────────────
    # Determine the dominant risk label (worst component weighted by severity)
    severity_order = {
        "CATASTROPHIC": 8, "CRITICAL": 7, "SEVERE": 6,
        "HIGH": 5, "ELEVATED": 4, "WIDE": 3, "UNSTABLE": 3,
        "MODERATE": 2, "LOW": 1, "NEGLIGIBLE": 1, "MINIMAL": 1,
        "STABLE": 1, "ADEQUATE": 2, "STRONG": 1,
    }
    component_labels = {
        "Ruin":          (ruin_label,  s_ruin),
        "Loss prob":     (loss_label,  s_loss),
        "DD tail":       (ddt_label,   s_ddt),
        "DD stability":  (dds_label,   s_dds),
        "Skew":          (skew_label,  s_skew),
        "Calmar":        (cal_label,   s_cal),
        "Sharpe":        (sh_label,    s_sh),
    }
    worst_component = min(
        component_labels.items(),
        key=lambda kv: kv[1][1]   # sort by score ascending → lowest score = worst
    )
    worst_name, (worst_label, worst_score) = worst_component

    risk_assessment = (
        f"Robustness score {robustness_score}/100. "
        f"Dominant risk factor: {worst_name} [{worst_label}]. "
        f"Ruin [{ruin_label}]: {ruin_detail} "
        f"Loss probability [{loss_label}]: {loss_detail} "
        f"Skew [{skew_label}]: {skew_detail} "
        f"Calmar [{cal_label}]: {cal_detail} "
        f"Sharpe [{sh_label}]: {sh_detail} "
        f"Simulation basis: {num_sims:,} runs, {n_trades} trades, "
        f"{sim_mode} resampling, {sizing_mode} sizing."
    )

    # ── 6. Sizing comment ─────────────────────────────────────────────────────
    sizing_comment = (
        f"{'OVER-AGGRESSIVE' if is_aggressive else 'WITHIN BOUNDS'}: "
        f"{sizing_diagnosis} "
        f"Median max drawdown = {dd_median:.1f}% "
        f"[target < {DD_MEDIAN_MODERATE:.0f}% for conservative, "
        f"< {DD_MEDIAN_HIGH:.0f}% for aggressive]. "
        f"P(DD≥30%) = {prob_dd30:.1f}%, P(DD≥40%) = {prob_dd40:.1f}%, "
        f"P(DD≥50%) = {prob_dd50:.1f}%."
    )

    # ── 7. Drawdown warning ───────────────────────────────────────────────────
    # Combine DD tail severity + stability + duration if available
    dd_dur_median = float(ddd.get("median", 0)) if ddd else 0
    dd_dur_p95    = float(ddd.get("p95",    0)) if ddd else 0

    duration_note = ""
    if dd_dur_p95 > 0:
        duration_note = (
            f" Duration: in the worst 5% of simulations, the strategy spent "
            f"{dd_dur_p95:.0f} consecutive trades underwater "
            f"(median duration: {dd_dur_median:.0f} trades)."
        )

    drawdown_warning = (
        f"Tail [{ddt_label}]: {ddt_detail} "
        f"Distribution stability [{dds_label}]: {dds_detail}"
        f"{duration_note}"
    )

    # ── 8. Recommendation ────────────────────────────────────────────────────
    recommendation = _generate_recommendation(
        robustness_score, is_aggressive,
        ruin_label, ddt_label, dds_label,
        prob_loss, dd_median, calmar, sharpe, sortino, cagr,
    )

    # ── 9. Debug / audit block ───────────────────────────────────────────────
    debug = {
        "component_scores": {
            "ruin":         {"score": round(s_ruin, 4),  "label": ruin_label,  "weight": W_RUIN},
            "prob_loss":    {"score": round(s_loss, 4),  "label": loss_label,  "weight": W_PROB_LOSS},
            "dd_tail":      {"score": round(s_ddt,  4),  "label": ddt_label,   "weight": W_DD_TAIL},
            "dd_stability": {"score": round(s_dds,  4),  "label": dds_label,   "weight": W_DD_STABILITY},
            "skew":         {"score": round(s_skew, 4),  "label": skew_label,  "weight": W_SKEW},
            "calmar":       {"score": round(s_cal,  4),  "label": cal_label,   "weight": W_CALMAR},
            "sharpe":       {"score": round(s_sh,   4),  "label": sh_label,    "weight": W_SHARPE},
        },
        "thresholds_used": {
            "ruin":         {"critical": RUIN_CRITICAL, "high": RUIN_HIGH, "elevated": RUIN_ELEVATED},
            "dd_p95":       {"catastrophic": DD_P95_CATASTROPHIC, "severe": DD_P95_SEVERE, "high": DD_P95_HIGH},
            "dd_spread":    {"unstable": DD_SPREAD_UNSTABLE, "wide": DD_SPREAD_WIDE},
            "prob_loss":    {"critical": PROB_LOSS_CRITICAL, "high": PROB_LOSS_HIGH},
            "calmar":       {"strong": CALMAR_STRONG, "adequate": CALMAR_ADEQUATE},
        },
        "inputs_used": {
            "fe_p5": fe_p5, "fe_median": fe_median, "fe_p95": fe_p95,
            "dd_p5": dd_p5, "dd_median": dd_median, "dd_p95": dd_p95,
            "prob_loss": prob_loss, "prob_ruin": prob_ruin,
            "prob_dd30": prob_dd30, "prob_dd40": prob_dd40, "prob_dd50": prob_dd50,
            "cagr": cagr, "sharpe": sharpe, "sortino": sortino, "calmar": calmar,
        },
        "is_over_aggressive": is_aggressive,
        "dominant_risk_factor": worst_name,
    }

    return {
        "risk_assessment":  risk_assessment,
        "sizing_comment":   sizing_comment,
        "drawdown_warning": drawdown_warning,
        "robustness_score": robustness_score,
        "recommendation":   recommendation,
        "_debug":           debug,
    }


# ─────────────────────────────────────────────────────────────────────────────
# EXAMPLE USAGE & SELF-CONTAINED TEST SUITE
# ─────────────────────────────────────────────────────────────────────────────

def _run_tests() -> None:
    """
    Deterministic test suite. Each case uses known inputs and asserts
    specific output properties. No external dependencies required.
    """
    import sys

    def assert_eq(val, expected, msg):
        if val != expected:
            print(f"  FAIL: {msg}\n    Expected: {expected!r}\n    Got:      {val!r}")
            sys.exit(1)
        else:
            print(f"  PASS: {msg}")

    def assert_range(val, lo, hi, msg):
        if not (lo <= val <= hi):
            print(f"  FAIL: {msg}\n    Expected [{lo}, {hi}], Got: {val!r}")
            sys.exit(1)
        else:
            print(f"  PASS: {msg} ({val})")

    def assert_contains(text, substr, msg):
        if substr not in text:
            print(f"  FAIL: {msg}\n    '{substr}' not found in output.")
            sys.exit(1)
        else:
            print(f"  PASS: {msg}")

    # ── Test 1: Catastrophic case ──────────────────────────────────────────
    print("\n[Test 1] Catastrophic sizing")
    t1 = interpret_monte_carlo_results({
        "finalEquity": {"p5": 200, "p25": 4000, "median": 8000, "p75": 14000, "p95": 22000},
        "maxDrawdown": {"p5": 20.0, "median": 55.0, "p75": 70.0, "p95": 85.0},
        "probBelowStart": 60.0,
        "probDD30": 90.0, "probDD40": 75.0, "probDD50": 55.0,
        "probRuin": 42.0,
        "var95": 200, "cvar95": 80,
        "cagr": -5.0, "sharpe": -0.3, "sortino": -0.4, "calmar": -0.1,
        "metadata": {"numSims": 5000, "simMode": "shuffle", "sizingMode": "r_fixed_fraction",
                     "n": 100, "tradesPerYear": 50, "startEquity": 10000},
    })
    assert_range(t1["robustness_score"], 0, 15, "Catastrophic case: robustness score ≤ 15")
    assert_eq(t1["_debug"]["is_over_aggressive"], True, "Catastrophic case: is_over_aggressive")
    assert_contains(t1["recommendation"], "HALT", "Catastrophic case: recommendation contains HALT")
    assert_contains(t1["risk_assessment"], "CRITICAL", "Catastrophic case: risk_assessment mentions CRITICAL")

    # ── Test 2: Healthy case ───────────────────────────────────────────────
    print("\n[Test 2] Healthy strategy")
    t2 = interpret_monte_carlo_results({
        "finalEquity": {"p5": 11500, "p25": 14000, "median": 17000, "p75": 21000, "p95": 28000},
        "maxDrawdown": {"p5": 3.0, "median": 10.0, "p75": 14.0, "p95": 18.0},
        "probBelowStart": 5.0,
        "probDD30": 3.0, "probDD40": 0.5, "probDD50": 0.1,
        "probRuin": 0.1,
        "var95": 11500, "cvar95": 11000,
        "cagr": 28.0, "sharpe": 1.8, "sortino": 2.6, "calmar": 2.8,
        "metadata": {"numSims": 5000, "simMode": "block_bootstrap", "sizingMode": "pnl_direct",
                     "n": 150, "tradesPerYear": 75, "startEquity": 10000},
    })
    assert_range(t2["robustness_score"], 80, 100, "Healthy case: robustness score ≥ 80")
    assert_eq(t2["_debug"]["is_over_aggressive"], False, "Healthy case: not over-aggressive")
    assert_contains(t2["recommendation"], "ACCEPTABLE", "Healthy case: recommendation is ACCEPTABLE")

    # ── Test 3: Moderate case with sizing warning ──────────────────────────
    print("\n[Test 3] Moderate — over-aggressive sizing")
    t3 = interpret_monte_carlo_results({
        "finalEquity": {"p5": 7000, "p25": 10500, "median": 15000, "p75": 20000, "p95": 30000},
        "maxDrawdown": {"p5": 8.0, "median": 28.0, "p75": 38.0, "p95": 50.0},
        "probBelowStart": 38.0,
        "probDD30": 55.0, "probDD40": 32.0, "probDD50": 14.0,
        "probRuin": 8.0,
        "var95": 7000, "cvar95": 5500,
        "cagr": 15.0, "sharpe": 0.6, "sortino": 0.9, "calmar": 0.54,
        "metadata": {"numSims": 1000, "simMode": "bootstrap", "sizingMode": "r_fixed_fraction",
                     "n": 80, "tradesPerYear": 40, "startEquity": 10000},
    })
    assert_eq(t3["_debug"]["is_over_aggressive"], True,  "Moderate case: is_over_aggressive")
    assert_contains(t3["sizing_comment"], "OVER-AGGRESSIVE", "Moderate case: sizing_comment")
    assert_contains(t3["recommendation"], "REDUCE",          "Moderate case: recommendation contains REDUCE")
    assert_range(t3["robustness_score"], 20, 55, "Moderate case: robustness score 20–55")

    # ── Test 4: Negative CAGR case ─────────────────────────────────────────
    print("\n[Test 4] Negative CAGR")
    t4 = interpret_monte_carlo_results({
        "finalEquity": {"p5": 6000, "p25": 8000, "median": 9200, "p75": 10500, "p95": 12000},
        "maxDrawdown": {"p5": 5.0, "median": 12.0, "p75": 18.0, "p95": 26.0},
        "probBelowStart": 45.0,
        "probDD30": 8.0, "probDD40": 2.0, "probDD50": 0.2,
        "probRuin": 1.5,
        "var95": 6000, "cvar95": 5000,
        "cagr": -4.5, "sharpe": -0.2, "sortino": -0.3, "calmar": -0.375,
        "metadata": {"numSims": 2000, "simMode": "shuffle", "sizingMode": "pnl_direct",
                     "n": 60, "tradesPerYear": 60, "startEquity": 10000},
    })
    assert_contains(t4["recommendation"], "NEGATIVE", "Negative CAGR: recommendation")
    assert_range(t4["robustness_score"], 0, 55, "Negative CAGR: robustness score ≤ 55")

    # ── Test 5: Unstable distribution ─────────────────────────────────────
    print("\n[Test 5] Unstable drawdown distribution")
    t5 = interpret_monte_carlo_results({
        "finalEquity": {"p5": 8000, "p25": 11000, "median": 14000, "p75": 19000, "p95": 26000},
        "maxDrawdown": {"p5": 2.0, "median": 22.0, "p75": 35.0, "p95": 48.0},   # spread = 46pp
        "probBelowStart": 18.0,
        "probDD30": 30.0, "probDD40": 12.0, "probDD50": 3.0,
        "probRuin": 1.8,
        "var95": 8000, "cvar95": 7000,
        "cagr": 12.0, "sharpe": 0.85, "sortino": 1.2, "calmar": 0.55,
        "metadata": {"numSims": 3000, "simMode": "shuffle", "sizingMode": "pnl_direct",
                     "n": 90, "tradesPerYear": 45, "startEquity": 10000},
    })
    assert_eq(t5["_debug"]["component_scores"]["dd_stability"]["label"], "UNSTABLE",
              "Unstable case: dd_stability label")
    assert_contains(t5["drawdown_warning"], "UNSTABLE", "Unstable case: drawdown_warning")

    # ── Test 6: Robustness score weights sum to 100 ────────────────────────
    print("\n[Test 6] Weight invariant")
    total = W_RUIN + W_PROB_LOSS + W_DD_TAIL + W_DD_STABILITY + W_SKEW + W_CALMAR + W_SHARPE
    assert_eq(total, 100, "Weights sum to 100")

    # ── Test 7: Score is always in [0, 100] ────────────────────────────────
    print("\n[Test 7] Score bounds")
    assert_range(t1["robustness_score"], 0, 100, "Score in [0,100] — catastrophic")
    assert_range(t2["robustness_score"], 0, 100, "Score in [0,100] — healthy")

    # ── Test 8: All required keys present ─────────────────────────────────
    print("\n[Test 8] Output schema")
    required_keys = {"risk_assessment", "sizing_comment", "drawdown_warning",
                     "robustness_score", "recommendation", "_debug"}
    for case_num, result in enumerate([t1, t2, t3, t4, t5], start=1):
        missing = required_keys - set(result.keys())
        assert_eq(missing, set(), f"Case {case_num}: all required keys present")

    print("\n✓ All tests passed.\n")


if __name__ == "__main__":
    import json

    # ── Run test suite ────────────────────────────────────────────────────────
    _run_tests()

    # ── Example call with pretty-printed output ───────────────────────────────
    example_input = {
        "finalEquity": {
            "p5":     9800,
            "p25":   13500,
            "median": 18200,
            "p75":   24100,
            "p95":   34500,
        },
        "maxDrawdown": {
            "p5":     4.1,
            "median": 14.5,
            "p75":    21.3,
            "p95":    29.8,
        },
        "ddDuration": {
            "median": 6.0,
            "p75":    11.0,
            "p95":    22.0,
            "mean":   7.2,
        },
        "probBelowStart": 12.0,
        "probDD30": 18.0,
        "probDD40":  5.5,
        "probDD50":  1.1,
        "probRuin":  0.8,
        "var95":  9800,
        "cvar95": 8700,
        "cagr":   22.4,
        "sharpe":  1.31,
        "sortino": 1.92,
        "calmar":  1.54,
        "metadata": {
            "seed":          42,
            "numSims":     5000,
            "simMode":    "block_bootstrap",
            "sizingMode": "r_fixed_fraction",
            "effectiveBlockSize": 4,
            "n":             120,
            "tradesPerYear":  60,
            "startEquity": 10000,
        },
    }

    result = interpret_monte_carlo_results(example_input)

    # Strip _debug for clean display
    display = {k: v for k, v in result.items() if k != "_debug"}
    print("─" * 72)
    print("EXAMPLE OUTPUT")
    print("─" * 72)
    print(json.dumps(display, indent=2))
    print("\n─" * 72)
    print("DEBUG / AUDIT BLOCK")
    print("─" * 72)
    print(json.dumps(result["_debug"], indent=2))