"""
routers/simulation.py
─────────────────────────────────────────────────────────────────────────────
Endpoints:
  POST /api/simulate   — run Monte Carlo + optional Kelly sweep + interpret
  POST /api/kelly      — Kelly sweep only (fast, no full simulation)
  POST /api/interpret  — interpret pre-computed MC results (pass-through)

v4 changes (drawdown-dependent sizing):
  - sizingMode now accepts 'r_dd_scaled'
  - Three new optional SimConfig fields:
      dd1:       float  drawdown level where scaling begins (default 0.10)
      dd2:       float  drawdown level where floor kicks in (default 0.30)
      fMinScale: float  floor multiplier g_min ∈ (0, 1]    (default 0.25)
  - A cross-field validator ensures dd1 < dd2 and fMinScale > 0.
  - When sizingMode='r_dd_scaled', the response includes result["ddScaling"]
    with attribution metrics (avgScalerValue, fracTradesReduced, baseline
    vs scaled comparison).

v3 changes (R-multiple enforcement) retained.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, validator, root_validator

from mc_engine import run_monte_carlo, run_kelly_sweep, RMultipleError
from mc_interpreter import interpret_monte_carlo_results

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# REQUEST / RESPONSE SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class Trade(BaseModel):
    pnl:          float
    risk_dollars: Optional[float] = None

    @validator("pnl")
    def pnl_must_be_finite(cls, v):
        import math
        if not math.isfinite(v):
            raise ValueError("pnl must be a finite number")
        return v

    @validator("risk_dollars")
    def risk_must_be_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError(
                f"risk_dollars must be > 0 (got {v}). "
                "Risk is the dollar amount at stake on this trade; "
                "zero or negative is not a valid risk amount."
            )
        return v


class SimConfig(BaseModel):
    simMode:       str   = Field("block_bootstrap",
                                  pattern="^(shuffle|bootstrap|block_bootstrap)$")
    numSims:       int   = Field(1000,   ge=1,    le=50_000)
    sizingMode:    str   = Field("r_compounded",
                                  pattern="^(pnl_direct|r_fixed_fraction|r_compounded|r_dd_scaled)$")
    tailRiskMode:  str   = Field("none", pattern="^(none|fat_tail|regime_switch)$")
    fraction:      float = Field(0.01,   gt=0,    le=1.0)
    tradesPerYear: int   = Field(50,     ge=1,    le=10_000)
    blockSize:     int   = Field(5,      ge=2,    le=500)
    autoBlockSize: bool  = False
    seed:          int   = Field(42,     ge=0)
    startEquity:   float = Field(10_000, gt=0)
    runKelly:      bool  = True
    stressVol:     float = Field(2.5,    ge=1.0,  le=10.0)
    studentTNu:    Optional[float] = Field(None,  ge=3.0, le=30.0)

    # ── [v5] Convergence diagnostics parameters ───────────────────────────
    convEpsilon:    float = Field(
        default=0.01, gt=0.0, lt=1.0,
        description=(
            "Relative-change threshold ε for declaring a metric stable. "
            "Δ_k < ε for K consecutive batches → metric converged. "
            "Default 0.01 = 1%."
        ),
    )
    convK:          int   = Field(
        default=3, ge=1, le=50,
        description="Consecutive batches that must each satisfy Δ_k < ε.",
    )
    convBatchSize:  int   = Field(
        default=500, ge=10, le=10_000,
        description="Number of new simulations run per convergence batch.",
    )
    convTailFlucThr: float = Field(
        default=0.05, gt=0.0, lt=1.0,
        description=(
            "If any tail metric (CVaR95 or ruin%) changes by more than this "
            "fraction between consecutive batches, a warning is emitted. Default 0.05 = 5%."
        ),
    )
    earlyStop:      bool  = Field(
        default=True,
        description=(
            "Stop simulations once all tracked metrics converge. "
            "Set False to always run exactly numSims (diagnostics still computed)."
        ),
    )
    # Only used when sizingMode='r_dd_scaled'. Ignored for all other modes.
    dd1:       float = Field(
        default=0.10, ge=0.01, le=0.99,
        description=(
            "Drawdown fraction at which risk scaling begins. "
            "Below this threshold, the full base fraction f0 is used. "
            "E.g. 0.10 = scaling starts when the account is 10% below its peak."
        ),
    )
    dd2:       float = Field(
        default=0.30, ge=0.02, le=1.00,
        description=(
            "Drawdown fraction at which the minimum fraction floor kicks in. "
            "Must be strictly greater than dd1. "
            "E.g. 0.30 = floor applies when the account is ≥30% below its peak."
        ),
    )
    fMinScale: float = Field(
        default=0.25, gt=0.0, le=1.0,
        description=(
            "Floor multiplier for the risk scaler g(). "
            "The realized fraction at DD ≥ dd2 is fraction × fMinScale. "
            "Must be > 0: zero sizing eliminates the recovery path. "
            "E.g. 0.25 = reduce to 25% of base risk in deep drawdown."
        ),
    )

    @validator("dd2")
    def dd2_must_exceed_dd1(cls, v, values):
        dd1 = values.get("dd1")
        if dd1 is not None and v <= dd1:
            raise ValueError(
                f"dd2 ({v}) must be strictly greater than dd1 ({dd1}). "
                f"The scaling ramp requires a non-zero width (dd2 - dd1 > 0)."
            )
        return v


def _validate_r_multiples_present(trades: list[Trade], sizing_mode: str) -> None:
    """
    Cross-field guard: when sizingMode requires R-multiples, every trade
    must supply risk_dollars. Surfaces as HTTP 422 (not 500).
    """
    if sizing_mode == "pnl_direct":
        return

    missing = [i for i, t in enumerate(trades) if t.risk_dollars is None]
    if missing:
        indices_str = ", ".join(str(i) for i in missing[:10])
        extra       = f" (and {len(missing) - 10} more)" if len(missing) > 10 else ""
        raise ValueError(
            f"sizingMode='{sizing_mode}' requires 'risk_dollars' on every trade, "
            f"but trades at index [{indices_str}]{extra} are missing it. "
            f"Provide the dollar risk per trade, or set sizingMode='pnl_direct'."
        )


class SimulateRequest(BaseModel):
    trades: list[Trade]
    config: SimConfig = Field(default_factory=SimConfig)

    @root_validator(skip_on_failure=True)
    def require_risk_dollars_for_r_modes(cls, values):
        trades = values.get("trades", [])
        config = values.get("config")
        if config and trades:
            _validate_r_multiples_present(trades, config.sizingMode)
        return values


class KellyRequest(BaseModel):
    trades: list[Trade]
    config: SimConfig = Field(default_factory=SimConfig)

    @root_validator(skip_on_failure=True)
    def require_risk_dollars_for_r_modes(cls, values):
        trades = values.get("trades", [])
        config = values.get("config")
        if config and trades:
            _validate_r_multiples_present(trades, config.sizingMode)
        return values


class InterpretRequest(BaseModel):
    data: dict[str, Any]


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/simulate")
def simulate(req: SimulateRequest) -> dict[str, Any]:
    if len(req.trades) < 2:
        raise HTTPException(status_code=422, detail="At least 2 trades required.")

    trades_dicts = [t.model_dump() for t in req.trades]
    cfg          = req.config.model_dump()

    try:
        mc_result = run_monte_carlo(trades_dicts, cfg)
    except (RMultipleError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if mc_result is None:
        raise HTTPException(status_code=500, detail="Simulation produced no result.")

    interpretation = interpret_monte_carlo_results(mc_result)

    return {
        "mc_result":      mc_result,
        "interpretation": interpretation,
    }


@router.post("/kelly")
def kelly(req: KellyRequest) -> dict[str, Any]:
    if len(req.trades) < 2:
        raise HTTPException(status_code=422, detail="At least 2 trades required.")

    trades_dicts = [t.model_dump() for t in req.trades]
    cfg          = req.config.model_dump()

    try:
        return run_kelly_sweep(trades_dicts, cfg)
    except (RMultipleError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/interpret")
def interpret(req: InterpretRequest) -> dict[str, Any]:
    return interpret_monte_carlo_results(req.data)
