"""Investigation loop: stopping, trace contents, reproducibility, isolation and speed."""

import json
import time
from datetime import datetime

import pytest

from app.agent.investigate import (
    investigate,
    investigate_frames,
    investigation_id,
    recommended_check,
)
from app.agent.planners import rule_planner
from app.cases import SEALED_CASES, get_scenario
from app.inference.engine import BUDGET, CONFIDENCE_TARGET
from app.runner import make_runner

PLANNERS = ["info_gain", "sweep", "random"]


def _run(case_id: str, planner: str, seed: int = 0) -> dict:
    scenario = get_scenario(case_id)
    assert scenario is not None
    return investigate(scenario.view(), make_runner(scenario, seed), rule_planner(planner), seed)


@pytest.mark.parametrize("planner", PLANNERS)
def test_trace_shape_and_budget(planner: str) -> None:
    trace = _run("case-t4", planner)
    assert trace["investigation_id"] == f"case-t4-{planner}-0"
    assert trace["source"] == "simulation"
    assert trace["planner"] == planner
    assert trace["cost"] == sum(step["cost"] for step in trace["steps"]) <= BUDGET
    assert trace["experiments"] == len(trace["steps"])
    points = [(s["rpm"], s["load_n"]) for s in trace["steps"]]
    assert len(points) == len(set(points))
    assert trace["stop_reason"] in {"confident", "budget", "no_affordable_experiment"}
    assert trace["diagnosis"]["explanation"]
    json.dumps(trace)  # serialisable


@pytest.mark.parametrize("planner", PLANNERS)
def test_rule_traces_are_bit_identical(planner: str) -> None:
    first = json.dumps(_run("case-b6", planner, seed=4), sort_keys=True)
    again = json.dumps(_run("case-b6", planner, seed=4), sort_keys=True)
    assert first == again


def test_different_seeds_give_different_measurements() -> None:
    a = _run("case-k7", "sweep", seed=1)["steps"][0]["measured"]
    b = _run("case-k7", "sweep", seed=2)["steps"][0]["measured"]
    assert a != b


def test_stops_when_confident() -> None:
    trace = _run("case-m9", "info_gain")
    assert trace["stop_reason"] == "confident"
    assert trace["diagnosis"]["confident"]
    assert trace["diagnosis"]["probability"] >= CONFIDENCE_TARGET
    for step in trace["steps"][:-1]:
        assert max(step["posterior"].values()) < CONFIDENCE_TARGET


def test_steps_record_predictions_and_posteriors() -> None:
    step = _run("case-r2", "sweep")["steps"][0]
    assert set(step["predictions"]) == set(step["posterior"])
    assert set(step["predictions"]["imbalance"]) == {"amp_1x_um", "amp_2x_um", "temp_rise_c"}
    assert sum(step["posterior"].values()) == pytest.approx(1.0, abs=1e-5)
    assert len(step["signals"]["displacement_um"]) <= 400
    assert max(step["signals"]["spectrum_freq_hz"]) <= 200


def test_diagnosis_lists_doubts_and_check() -> None:
    diagnosis = _run("case-x1", "random")["diagnosis"]
    assert diagnosis["ranked"][0]["hypothesis"] == diagnosis["top"]
    assert all(d["probability"] >= 0.05 for d in diagnosis["remaining_doubts"])
    assert diagnosis["recommended_check"] == recommended_check(diagnosis["top"])


@pytest.mark.parametrize("case", SEALED_CASES, ids=lambda c: c.case_id)
def test_info_gain_solves_sealed_cases(case) -> None:
    trace = investigate(case.view(), make_runner(case, 0), rule_planner("info_gain"), 0)
    assert trace["diagnosis"]["top"] == case.truth


@pytest.mark.parametrize("case", SEALED_CASES, ids=lambda c: c.case_id)
def test_trace_never_contains_hidden_values(case) -> None:
    text = json.dumps(investigate(case.view(), make_runner(case, 0), rule_planner("sweep"), 0))
    hidden = {"wn_rpm", "thermal", "faults", "truth", "machine"}
    assert not any(f'"{key}"' in text for key in hidden)
    assert f"{case.machine.wn_rpm}" not in text


def test_investigation_is_fast() -> None:
    # Best of three, so a busy CI runner's scheduling noise does not fail the 2 s target.
    timings = []
    for _ in range(3):
        start = time.perf_counter()
        _run("case-x1", "info_gain")
        timings.append(time.perf_counter() - start)
    assert min(timings) < 2.0


def test_investigation_ids() -> None:
    assert investigation_id("case-k7", "sweep", 3) == "case-k7-sweep-3"
    when = datetime(2026, 10, 30, 14, 5, 9)
    assert investigation_id("case-k7", "meta", 3, when) == "case-k7-meta-3-20261030140509"


def test_recommended_check_for_combined_fault() -> None:
    text = recommended_check("imbalance+friction")
    assert "balance" in text and "lubrication" in text


def test_frame_sequence_matches_phases() -> None:
    frames = list(
        investigate_frames(
            get_scenario("case-t4").view(),
            make_runner(get_scenario("case-t4"), 0),
            rule_planner("info_gain"),
            0,
        )
    )
    kinds = [f["kind"] for f in frames]
    assert kinds[0] == "prior"
    assert kinds[1] == "alarm"
    assert kinds[-2] == "diagnosis"
    assert kinds[-1] == "trace"
    step_kinds = [k for k in kinds if k in {"choice", "predict", "result", "update"}]
    # phases repeat in groups of 4 per experiment
    assert len(step_kinds) % 4 == 0
    # every choice/predict/result/update carries a step number and the case id
    for f in frames:
        assert f["investigation_id"] == "case-t4-info_gain-0"
        assert f["case"]["case_id"] == "case-t4"
        if f["kind"] in {"choice", "predict", "result", "update"}:
            assert "step" in f


def test_investigate_matches_frame_collection() -> None:
    """investigate() returns the same trace as the final frame of investigate_frames()."""
    scenario = get_scenario("case-b6")
    direct = investigate(scenario.view(), make_runner(scenario, 7), rule_planner("sweep"), 7)
    frames = list(
        investigate_frames(scenario.view(), make_runner(scenario, 7), rule_planner("sweep"), 7)
    )
    traced = frames[-1]
    assert traced["kind"] == "trace"
    assert json.dumps(traced["trace"], sort_keys=True) == json.dumps(direct, sort_keys=True)
