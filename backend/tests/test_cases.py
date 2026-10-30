import dataclasses

import numpy as np
import pytest

from app.cases import (
    SEALED_CASES,
    TRUTH_LABELS,
    CaseView,
    get_scenario,
    public_cases,
    random_scenarios,
    truth_label,
)
from app.physics.model import Faults
from app.runner import make_runner

PUBLIC_FIELDS = {"case_id", "title", "note", "initial_rpm", "initial_load_n"}


def test_case_view_has_exactly_the_public_fields() -> None:
    assert {f.name for f in dataclasses.fields(CaseView)} == PUBLIC_FIELDS


def test_public_cases_list_six_sealed_cases_at_the_alarm_point() -> None:
    cases = public_cases()

    assert [c.case_id for c in cases] == [
        "case-k7",
        "case-r2",
        "case-m9",
        "case-t4",
        "case-b6",
        "case-x1",
    ]
    assert all(isinstance(c, CaseView) for c in cases)
    assert {(c.initial_rpm, c.initial_load_n) for c in cases} == {(2950.0, 500.0)}


def test_sealed_cases_cover_every_hypothesis() -> None:
    assert sorted(case.truth for case in SEALED_CASES) == sorted(TRUTH_LABELS)


def test_get_scenario_returns_none_for_unknown_ids() -> None:
    assert get_scenario("case-k7") is SEALED_CASES[0]
    assert get_scenario("nope") is None


def test_truth_label_rejects_unmodelled_combinations() -> None:
    with pytest.raises(ValueError):
        truth_label(Faults(misalignment=0.2, friction=0.2))


def test_random_scenarios_are_balanced_reproducible_and_off_grid() -> None:
    first = random_scenarios(per_hypothesis=20, seed=11)
    second = random_scenarios(per_hypothesis=20, seed=11)

    assert first == second
    assert len(first) == 120
    assert len({c.case_id for c in first}) == 120
    for label in TRUTH_LABELS:
        assert sum(c.truth == label for c in first) == 20
    for case in first:
        assert 3300.0 <= case.machine.wn_rpm <= 3900.0
        assert 0.7 <= case.machine.thermal <= 1.4
        severities = [case.faults.imbalance, case.faults.misalignment, case.faults.friction]
        assert all(s == 0.0 or 0.15 <= s <= 0.8 for s in severities)


def test_runner_is_reproducible_per_experiment_index() -> None:
    run = make_runner(SEALED_CASES[0], seed=4)

    first = run(2950.0, 500.0, 3)
    run(1500.0, 0.0, 1)
    again = run(2950.0, 500.0, 3)

    assert first.features == again.features
    assert np.array_equal(first.displacement_um, again.displacement_um)
    assert run(2950.0, 500.0, 4).features != first.features
    assert make_runner(SEALED_CASES[0], seed=5)(2950.0, 500.0, 3).features != first.features
