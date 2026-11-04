"""Run, save, list and load investigations, plus the readiness check."""

import json
from contextlib import ExitStack
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from app.agent.investigate import investigate_frames, investigation_id
from app.agent.llm_client import ChatCompletionsClient
from app.agent.meta_planner import answer_question
from app.api.deps import reject_cross_site, scenario_or_404, settings_of
from app.api.runs import (
    META_NOT_CONFIGURED,
    MetaNotConfiguredError,
    MetaRunLimiter,
    build_planner,
    reserve_meta_id,
    run_and_save,
)
from app.api.storage import InvalidIdError, ReplayStore
from app.config import Settings
from app.physics.model import MODEL_VERSION
from app.runner import make_runner
from app.schemas.investigation import (
    Answer,
    InvestigationRequest,
    PlannerName,
    QuestionRequest,
    Ready,
    Trace,
    TraceSummary,
)

router = APIRouter(prefix="/api", tags=["investigations"])
SettingsDep = Annotated[Settings, Depends(settings_of)]
META_LIMIT_REACHED = (
    "The hourly limit of Meta model investigations for this server has been reached. "
    "Try again later, replay a saved investigation, or use planner 'info_gain'."
)
QUESTION_LIMIT_REACHED = (
    "The hourly limit of questions to the Meta model for this server has been reached. "
    "The recorded explanation and evidence remain available in the replay."
)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _admit_meta(request: Request, settings: Settings) -> None:
    """503 when the model is not configured, 429 when the hourly Meta budget is spent."""
    if not settings.llm_configured:
        raise HTTPException(status_code=503, detail=META_NOT_CONFIGURED)
    limiter: MetaRunLimiter = request.app.state.meta_limiter
    if not limiter.try_start(_client_key(request)):
        raise HTTPException(status_code=429, detail=META_LIMIT_REACHED)


def _admit_compute(request: Request) -> None:
    """429 when this client's share of the hourly compute budget is spent."""
    limiter: MetaRunLimiter = request.app.state.compute_limiter
    if not limiter.try_start(_client_key(request)):
        raise HTTPException(
            status_code=429,
            detail="The hourly compute limit for this server has been reached. Try again later.",
        )


def _sse(frame: dict[str, Any]) -> str:
    return f"data: {json.dumps(frame, ensure_ascii=False)}\n\n"


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


@router.post("/investigations", response_model=Trace, dependencies=[Depends(reject_cross_site)])
def run_investigation(body: InvestigationRequest, request: Request, settings: SettingsDep) -> Trace:
    scenario = scenario_or_404(body.case_id)
    store = ReplayStore(settings.replays_dir)
    if body.planner == "meta":
        _admit_meta(request, settings)
    else:
        _admit_compute(request)
    try:
        return run_and_save(scenario, body.planner, body.seed, settings, store)
    except MetaNotConfiguredError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/investigations/stream", dependencies=[Depends(reject_cross_site)])
def stream_investigation(
    request: Request,
    case_id: Annotated[str, Query(min_length=1, max_length=64)],
    planner: PlannerName = "meta",
    seed: int = Query(0, ge=0, le=10_000),
    settings: SettingsDep = ...,
) -> StreamingResponse:
    """Stream investigation frames live as Server-Sent Events.

    Each frame is one investigation phase (prior, alarm, choice, predict, result,
    update, diagnosis) followed by a final ``trace`` frame holding the complete
    replayable trace. The trace is validated and saved before that frame is sent, so
    its id always names a stored replay. Data is simulated; frames are produced by the
    simulator and Bayesian engine, never by the Meta model.
    """
    scenario = scenario_or_404(case_id)
    store = ReplayStore(settings.replays_dir)
    if planner == "meta":
        _admit_meta(request, settings)
    else:
        _admit_compute(request)

    def event_iter():
        # The id is reserved only once streaming starts, so a client that disconnects
        # before the first chunk never leaves an empty reservation behind.
        trace_id: str | None = None
        saved = False
        try:
            with ExitStack() as stack:
                planner_instance = build_planner(planner, settings, stack)
                if planner == "meta":
                    trace_id = reserve_meta_id(store, scenario.case_id, seed, datetime.now(UTC))
                else:
                    trace_id = investigation_id(scenario.case_id, planner, seed)
                for frame in investigate_frames(
                    scenario.view(),
                    make_runner(scenario, seed),
                    planner_instance,
                    seed,
                    trace_id=trace_id,
                ):
                    if frame["kind"] == "trace":
                        validated = Trace.model_validate(frame["trace"])
                        store.save(validated.model_dump(mode="json"))
                        saved = True
                    yield _sse(frame)
        except BaseException:
            if planner == "meta" and trace_id is not None and not saved:
                store.release(trace_id)
            raise

    return StreamingResponse(
        event_iter(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/investigations", response_model=list[TraceSummary])
def list_investigations(settings: SettingsDep) -> list[TraceSummary]:
    summaries = (_summary(t, d) for t, d in ReplayStore(settings.replays_dir).list())
    return [s for s in summaries if s is not None]


def _stored_trace(investigation_id: str, settings: Settings) -> Trace:
    """The saved, validated trace, or 400 (bad id) / 404 (missing or unreadable)."""
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


@router.get("/investigations/{investigation_id}", response_model=Trace)
def load_investigation(investigation_id: str, settings: SettingsDep) -> Trace:
    return _stored_trace(investigation_id, settings)


@router.post(
    "/investigations/{investigation_id}/ask",
    response_model=Answer,
    dependencies=[Depends(reject_cross_site)],
)
def ask_investigation(
    investigation_id: str, body: QuestionRequest, request: Request, settings: SettingsDep
) -> Answer:
    """Ask the Meta model a question about a finished investigation (D-75).

    The model sees only the saved trace's public evidence and the question. Its answer is
    returned, never written into the trace, and cannot change a measurement, probability
    or diagnosis. Any model failure returns a fallback answer with `ok: false`.
    """
    trace = _stored_trace(investigation_id, settings)
    if not settings.llm_configured:
        raise HTTPException(status_code=503, detail=META_NOT_CONFIGURED)
    limiter: MetaRunLimiter = request.app.state.question_limiter
    if not limiter.try_start(_client_key(request)):
        raise HTTPException(status_code=429, detail=QUESTION_LIMIT_REACHED)
    with ChatCompletionsClient.from_settings(settings) as client:
        result = answer_question(client, trace.model_dump(mode="json"), body.question)
    return Answer(investigation_id=trace.investigation_id, **result)
