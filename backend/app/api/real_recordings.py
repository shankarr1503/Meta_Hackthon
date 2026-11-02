"""Read-only evidence from an attributed, measured laboratory dataset."""

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.api.deps import settings_of
from app.config import BACKEND_DIR, Settings

router = APIRouter(prefix="/api/real-recordings", tags=["real recordings"])


@router.get("")
def recordings(settings: Annotated[Settings, Depends(settings_of)]) -> dict[str, Any]:
    path = settings.results_dir / "real-recordings.json"
    if not path.is_file():
        raise HTTPException(
            status_code=404, detail="Real recording examples have not been prepared"
        )
    report = json.loads(path.read_text(encoding="utf-8"))
    if report.get("source") != "measured_laboratory":
        raise HTTPException(status_code=503, detail="Real recording evidence has an invalid source")
    return report


@router.get("/photo", response_class=FileResponse)
def photo() -> FileResponse:
    path = BACKEND_DIR / "data" / "real" / "test-bench.jpg"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Source test-rig photograph is unavailable")
    return FileResponse(path, media_type="image/jpeg")
