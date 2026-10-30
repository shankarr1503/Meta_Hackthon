"""Health route: confirms the service is up. Touches no simulation state."""

from fastapi import APIRouter

from app.config import CONTRACT_VERSION, SERVICE_NAME, VERSION
from app.schemas.health import HealthResponse

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        version=VERSION,
        contract_version=CONTRACT_VERSION,
    )
