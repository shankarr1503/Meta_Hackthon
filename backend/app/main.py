"""FastAPI app factory. Run with: uvicorn app.main:app --port 8000"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.config import SERVICE_NAME, VERSION, Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="FailureLab AI",
        version=VERSION,
        description=f"{SERVICE_NAME}: all data is simulated.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(health_router)
    return app


app = create_app()
