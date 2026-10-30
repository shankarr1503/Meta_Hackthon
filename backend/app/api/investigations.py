"""Run, save, list and load investigations, plus the readiness check."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.agent.investigate import investigate, investigation_id
from app.agent.planners import Planner, rule_planner
from app.api.deps import scenario_or_404, settings_of
from app.api.storage import InvalidIdError, ReplayStore
from app.config import Settings
from app.physics.model import MODEL_VERSION
from app.runner import make_runner
from app.schemas.investigation import InvestigationRequest, Ready, Trace, TraceSummary

router = APIRouter(prefix="/api", tags=["investigations"])
SettingsDep = Annotated[Settings, Depends(settings_of)]

META_NOT_CONFIGURED = (
    "The Meta model is not configured. Set FAILURELAB_LLM_API_KEY, FAILURELAB_LLM_MODEL and "
    "FAILURELAB_LLM_BASE_URL in backend/.env, or use planner 'info_gain'."
)


def _planner(name: str, settings: Settings) -> Planner:
    if name != "meta":
        return rule_planner(name)
    if not settings.llm_configured:
        raise HTTPException(status_code=503, detail=META_NOT_CONFIGURED)
    raise HTTPException(status_code=503, detail="The Meta model planner is not available yet.")


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
    planner = _planner(request.planner, settings)
    now = datetime.now(UTC) if request.planner == "meta" else None
    trace = investigate(
        scenario.view(),
        make_runner(scenario, request.seed),
        planner,
        request.seed,
        trace_id=investigation_id(scenario.case_id, request.planner, request.seed, now),
    )
    validated = Trace.model_validate(trace)
    ReplayStore(settings.replays_dir).save(validated.model_dump(mode="json"))
    return validated


@router.get("/investigations", response_model=list[TraceSummary])
def list_investigations(settings: SettingsDep) -> list[TraceSummary]:
    return [
        TraceSummary(
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
        for trace, is_demo in ReplayStore(settings.replays_dir).list()
    ]


@router.get("/investigations/{investigation_id}", response_model=Trace)
def load_investigation(investigation_id: str, settings: SettingsDep) -> Trace:
    try:
        trace = ReplayStore(settings.replays_dir).load(investigation_id)
    except InvalidIdError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if trace is None:
        raise HTTPException(status_code=404, detail=f"No replay {investigation_id!r}")
    return Trace.model_validate(trace)
