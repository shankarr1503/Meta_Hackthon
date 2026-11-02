"""Benchmark results as written by scripts/benchmark.py."""

from typing import Any, Literal

from app.schemas.simulation import Closed


class PlannerMetrics(Closed):
    runs: int
    accuracy: float
    mean_experiments: float
    mean_cost: float
    reached_target: float
    accuracy_when_confident: float | None
    fallback_rate: float | None


class Benchmark(Closed):
    source: Literal["simulation"]
    model_version: str
    generated_at: str
    rules: dict[str, float]
    protocols: dict[str, dict[str, Any]]
    planners: dict[str, dict[str, PlannerMetrics]]
    proof: dict[str, Any] | None = None
