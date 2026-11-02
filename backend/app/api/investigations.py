"""Run, save, list and load investigations, plus the readiness check."""

import json
from contextlib import ExitStack
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from app.agent.investigate import investigate_frames, investigation_id
from app.api.deps import scenario_or_404, settings_of
from app.api.runs import (
    META_NOT_CONFIGURED,
    MetaNotConfiguredError,
    build_planner,
    reserve_meta_id,
    run_and_save,
)
from app.api.storage import InvalidIdError, ReplayStore
from app.config import Settings
from app.physics.model import MODEL_VERSION
from app.runner import make_runner
from app.schemas.investigation import (
    InvestigationRequest,
    PlannerName,
    Ready,
    Trace,
    TraceSummary,
)

router = APIRouter(prefix="/api", tags=["investigations"])
SettingsDep = Annotated[Settings, Depends(settings_of)]


def _summary(trace: dict[str, Any], is_demo: bool) -> TraceSummary | None:
    """Summary of a stored trace, or None if it is not a readable trace."""
    try:
        return TraceSummary(
            investigation_id=trace["investigation_id"],
            case_id=trace["case"]["case_id"],
            planner=trace["planner"],
            seed=trace["seed"],
            top=trace["diagnosis"]["top"],
            probability=trace["diagnosis"]["probability"],
            experiments=trace["experiments"],
            cost=trace["cost"],
            demo=is_demo,
        )
    except (KeyError, TypeError, ValidationError):
        return None


@router.get("/ready", response_model=Ready)
def ready(settings: SettingsDep) -> Ready:
    return Ready(
        status="ok",
        physics_model_version=MODEL_VERSION,
        meta_model_configured=settings.llm_configured,
        meta_model=settings.llm_model if settings.llm_configured else "",
    )


@router.post("/investigations", response_model=Trace)
def run_investigation(request: InvestigationRequest, settings: SettingsDep) -> Trace:
    scenario = scenario_or_404(request.case_id)
    store = ReplayStore(settings.replays_dir)
    try:
        return run_and_save(scenario, request.planner, request.seed, settings, store)
    except MetaNotConfiguredError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/investigations/stream")
def stream_investigation(
    case_id: str,
    planner: PlannerName = "meta",
    seed: int = Query(0, ge=0, le=10_000),
    settings: SettingsDep = ...,
) -> StreamingResponse:
    """Stream investigation frames live as Server-Sent Events.

    Each frame is one investigation phase (prior, alarm, choice, predict, result,
    update, diagnosis) followed by a final ``trace`` frame holding the complete
    replayable trace. Data is simulated; frames are produced by the simulator and
    Bayesian engine, never by the Meta model.
    """
    scenario = scenario_or_404(case_id)
    store = ReplayStore(settings.replays_dir)

    if planner == "meta" and not settings.llm_configured:
        raise HTTPException(status_code=503, detail=META_NOT_CONFIGURED)

    if planner == "meta":
        trace_id = reserve_meta_id(store, scenario.case_id, seed, datetime.now(UTC))
    else:
        trace_id = investigation_id(scenario.case_id, planner, seed)

    def event_iter():
        with ExitStack() as stack:
            planner_instance = build_planner(planner, settings, stack)
            try:
                full_trace = None
                for frame in investigate_frames(
                    scenario.view(),
                    make_runner(scenario, seed),
                    planner_instance,
                    seed,
                    trace_id=trace_id,
                ):
                    if frame["kind"] == "trace":
                        full_trace = frame["trace"]
                    yield f"data: {json.dumps(frame, ensure_ascii=False)}\n\n"
                if full_trace is not None:
                    validated = Trace.model_validate(full_trace)
                    store.save(validated.model_dump(mode="json"))
            except BaseException:
                if planner == "meta":
                    store.release(trace_id)
                raise

    return StreamingResponse(event_iter(), media_type="text/event-stream")


@router.get("/investigations", response_model=list[TraceSummary])
def list_investigations(settings: SettingsDep) -> list[TraceSummary]:
    summaries = (_summary(t, d) for t, d in ReplayStore(settings.replays_dir).list())
    return [s for s in summaries if s is not None]


@router.get("/investigations/{investigation_id}", response_model=Trace)
def load_investigation(investigation_id: str, settings: SettingsDep) -> Trace:
    try:
        trace = ReplayStore(settings.replays_dir).load(investigation_id)
    except InvalidIdError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if trace is None:
        raise HTTPException(status_code=404, detail=f"No replay {investigation_id!r}")
    try:
        return Trace.model_validate(trace)
    except ValidationError as error:
        detail = f"Replay {investigation_id!r} is unreadable or from an older version"
        raise HTTPException(status_code=404, detail=detail) from error
