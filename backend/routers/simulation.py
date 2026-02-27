"""
routers/simulation.py
─────────────────────────────────────────────────────────────────────────────
Endpoints:
  POST /api/simulate   — run Monte Carlo + optional Kelly sweep + interpret
  POST /api/kelly      — Kelly sweep only (fast, no full simulation)
  POST /api/interpret  — interpret pre-computed MC results (pass-through)
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, validator

from mc_engine import run_monte_carlo, run_kelly_sweep
from mc_interpreter import interpret_monte_carlo_results

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# REQUEST / RESPONSE SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class Trade(BaseModel):
    pnl:          float
    risk_dollars: float | None = None

    @validator("pnl")
    def pnl_must_be_finite(cls, v):
        import math
        if not math.isfinite(v):
            raise ValueError("pnl must be a finite number")
        return v


class SimConfig(BaseModel):
    simMode:       str   = Field("shuffle", pattern="^(shuffle|bootstrap|block_bootstrap)$")
    numSims:       int   = Field(1000,  ge=1,    le=50_000)
    sizingMode:    str   = Field("pnl_direct", pattern="^(pnl_direct|r_fixed_fraction)$")
    fraction:      float = Field(0.01,  gt=0,    le=1.0)
    tradesPerYear: int   = Field(50,    ge=1,    le=10_000)
    blockSize:     int   = Field(5,     ge=2,    le=500)
    autoBlockSize: bool  = False
    seed:          int   = Field(42,    ge=0)
    startEquity:   float = Field(10_000, gt=0)
    runKelly:      bool  = True


class SimulateRequest(BaseModel):
    trades: list[Trade]
    config: SimConfig = Field(default_factory=SimConfig)


class KellyRequest(BaseModel):
    trades: list[Trade]
    config: SimConfig = Field(default_factory=SimConfig)


class InterpretRequest(BaseModel):
    data: dict[str, Any]


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/simulate")
def simulate(req: SimulateRequest) -> dict[str, Any]:
    """
    Run the full Monte Carlo simulation and return:
      - mc_result:    raw simulation output (envelopes, distributions, metrics)
      - interpretation: deterministic risk assessment from mc_interpreter
    """
    if len(req.trades) < 2:
        raise HTTPException(status_code=422, detail="At least 2 trades required.")

    trades_dicts = [t.model_dump() for t in req.trades]
    cfg          = req.config.model_dump()

    mc_result = run_monte_carlo(trades_dicts, cfg)

    if mc_result is None:
        raise HTTPException(status_code=500, detail="Simulation produced no result.")

    interpretation = interpret_monte_carlo_results(mc_result)

    return {
        "mc_result":      mc_result,
        "interpretation": interpretation,
    }


@router.post("/kelly")
def kelly(req: KellyRequest) -> dict[str, Any]:
    """
    Run only the Kelly fraction sensitivity sweep (fast, ~400 sims/point).
    Useful for the settings panel without re-running the full simulation.
    """
    if len(req.trades) < 2:
        raise HTTPException(status_code=422, detail="At least 2 trades required.")

    trades_dicts = [t.model_dump() for t in req.trades]
    cfg          = req.config.model_dump()

    return run_kelly_sweep(trades_dicts, cfg)


@router.post("/interpret")
def interpret(req: InterpretRequest) -> dict[str, Any]:
    """
    Re-interpret pre-computed MC results.
    Useful when the frontend stores raw MC output and wants updated insights.
    """
    return interpret_monte_carlo_results(req.data)
