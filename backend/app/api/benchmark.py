"""Latest benchmark results, as committed in backend/results/benchmark.json."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.api.deps import settings_of
from app.config import Settings
from app.schemas.benchmark import Benchmark

router = APIRouter(prefix="/api", tags=["benchmark"])
BENCHMARK_FILE = "benchmark.json"


@router.get("/proof/download", response_class=FileResponse)
def proof_download(settings: Annotated[Settings, Depends(settings_of)]) -> FileResponse:
    path = settings.results_dir / "proof.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Proof challenge has not been run yet")
    return FileResponse(path, media_type="application/json", filename="failurelab-proof.json")


@router.get("/benchmark", response_model=Benchmark)
def benchmark(settings: Annotated[Settings, Depends(settings_of)]) -> Benchmark:
    path = settings.results_dir / BENCHMARK_FILE
    if not path.is_file():
        raise HTTPException(
            status_code=404, detail="No benchmark yet: run python scripts/benchmark.py"
        )
    return Benchmark.model_validate(json.loads(path.read_text(encoding="utf-8")))
