"""
main.py — EyZonCharts FastAPI backend
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import simulation
from mc_interpreter import interpret_monte_carlo_results

app = FastAPI(title="EyZonCharts API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://eyzoncharts.vercel.app"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────
app.include_router(simulation.router, prefix="/api")


# ── Legacy /api/interpret endpoint (Step 1 compatibility) ─────────────────
@app.post("/api/interpret")
def interpret(body: dict):
    return interpret_monte_carlo_results(body["data"])
