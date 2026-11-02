"""FastAPI app factory. Run with: uvicorn app.main:app --port 8000"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.benchmark import router as benchmark_router
from app.api.health import router as health_router
from app.api.investigations import router as investigations_router
from app.api.real_recordings import router as real_recordings_router
from app.api.runs import MetaRunLimiter
from app.api.simulation import router as simulation_router
from app.config import SERVICE_NAME, VERSION, Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="FailureLab AI",
        version=VERSION,
        description=f"{SERVICE_NAME}: simulated investigations and real laboratory recordings.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    # Compress large JSON (benchmark, proof and real-recording evidence). Event streams are
    # excluded by Starlette, so live frames are not buffered.
    app.add_middleware(GZipMiddleware, minimum_size=2048)
    app.state.settings = settings
    app.state.meta_limiter = MetaRunLimiter(settings.meta_runs_per_hour)
    for router in (
        health_router,
        simulation_router,
        investigations_router,
        benchmark_router,
        real_recordings_router,
    ):
        app.include_router(router)
    if settings.frontend_dir is not None:
        if not (settings.frontend_dir / "index.html").is_file():
            raise RuntimeError("Frontend build missing; run python scripts/tasks.py build first")
        # Register last so API routes keep their normal validation and response models.
        app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="dashboard")
    return app


app = create_app()
