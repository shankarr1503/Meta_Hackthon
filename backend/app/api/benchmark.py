"""Latest benchmark results, as committed in backend/results/benchmark.json."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import settings_of
from app.config import Settings
from app.schemas.benchmark import Benchmark

router = APIRouter(prefix="/api", tags=["benchmark"])
BENCHMARK_FILE = "benchmark.json"


@router.get("/benchmark", response_model=Benchmark)
def benchmark(settings: Annotated[Settings, Depends(settings_of)]) -> Benchmark:
    path = settings.results_dir / BENCHMARK_FILE
    if not path.is_file():
        raise HTTPException(
            status_code=404, detail="No benchmark yet: run python scripts/benchmark.py"
        )
    return Benchmark.model_validate(json.loads(path.read_text(encoding="utf-8")))
