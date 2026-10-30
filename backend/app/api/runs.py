"""Run an investigation on a sealed case and save its replay.

Shared by the API route and scripts/demo_replays.py, so both build planners, ids and
replays the same way.
"""

from contextlib import ExitStack
from datetime import UTC, datetime

from app.agent.investigate import investigate, investigation_id
from app.agent.llm_client import ChatCompletionsClient
from app.agent.meta_planner import MetaPlanner
from app.agent.planners import Planner, rule_planner
from app.api.storage import ReplayStore
from app.cases import Scenario
from app.config import Settings
from app.runner import make_runner
from app.schemas.investigation import Trace

META_NOT_CONFIGURED = (
    "The Meta model is not configured. Set FAILURELAB_LLM_API_KEY, FAILURELAB_LLM_MODEL and "
    "FAILURELAB_LLM_BASE_URL in backend/.env, or use planner 'info_gain'."
)
MAX_SAME_SECOND_RUNS = 50


class MetaNotConfiguredError(RuntimeError):
    pass


def build_planner(name: str, settings: Settings, stack: ExitStack) -> Planner:
    """A planner for `name`; a Meta client is closed when `stack` closes."""
    if name != "meta":
        return rule_planner(name)
    if not settings.llm_configured:
        raise MetaNotConfiguredError(META_NOT_CONFIGURED)
    client = stack.enter_context(ChatCompletionsClient.from_settings(settings))
    return MetaPlanner(client)


def reserve_meta_id(store: ReplayStore, case_id: str, seed: int, now: datetime) -> str:
    """A timestamped Meta id no other run holds. Two runs in the same second get `-2`, `-3`."""
    base = investigation_id(case_id, "meta", seed, now)
    for attempt in range(1, MAX_SAME_SECOND_RUNS + 1):
        candidate = base if attempt == 1 else f"{base}-{attempt}"
        if store.reserve(candidate):
            return candidate
    raise RuntimeError(f"too many Meta runs of {case_id} in one second")


def run_and_save(
    scenario: Scenario, planner_name: str, seed: int, settings: Settings, store: ReplayStore
) -> Trace:
    with ExitStack() as stack:
        planner = build_planner(planner_name, settings, stack)
        if planner_name == "meta":
            trace_id = reserve_meta_id(store, scenario.case_id, seed, datetime.now(UTC))
        else:
            trace_id = investigation_id(scenario.case_id, planner_name, seed)
        try:
            trace = investigate(
                scenario.view(), make_runner(scenario, seed), planner, seed, trace_id=trace_id
            )
            validated = Trace.model_validate(trace)
        except BaseException:
            if planner_name == "meta":
                store.release(trace_id)
            raise
    store.save(validated.model_dump(mode="json"))
    return validated
