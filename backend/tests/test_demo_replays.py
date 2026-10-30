"""Committed demo replays are valid traces and replay identically."""

import json
from pathlib import Path

import pytest

from app.agent.investigate import investigate
from app.agent.meta_planner import MetaPlanner, ReplayClient
from app.agent.planners import rule_planner
from app.cases import get_scenario
from app.runner import make_runner
from app.schemas.investigation import Trace
from scripts.demo_replays import DEMO_DIR, make_demo

DEMOS = sorted(DEMO_DIR.glob("*.json"))


def test_demo_replays_exist() -> None:
    assert DEMOS, "no committed demo replays in backend/replays/demo/"


@pytest.mark.parametrize("path", DEMOS, ids=lambda p: p.stem)
def test_demo_replay_is_valid_and_reproducible(path: Path) -> None:
    trace = json.loads(path.read_text(encoding="utf-8"))
    Trace.model_validate(trace)
    assert path.stem == trace["investigation_id"]
    scenario = get_scenario(trace["case"]["case_id"])
    if trace["planner"] == "meta":
        model = trace["llm_events"][0]["model"] if trace["llm_events"] else "replay"
        planner = MetaPlanner(ReplayClient(trace["llm_events"], model=model))
    else:
        planner = rule_planner(trace["planner"])
    again = investigate(
        scenario.view(),
        make_runner(scenario, trace["seed"]),
        planner,
        trace["seed"],
        trace_id=trace["investigation_id"],
    )
    assert json.loads(json.dumps(again)) == trace


def test_make_demo_writes_a_valid_trace(tmp_path: Path) -> None:
    path = make_demo("case-m9", "sweep", 1, tmp_path)
    assert path.name == "case-m9-sweep-1.json"
    Trace.model_validate(json.loads(path.read_text(encoding="utf-8")))
