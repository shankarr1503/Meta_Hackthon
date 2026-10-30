"""Rule planners: budget, repeats, sweep order and seeded choices."""

import numpy as np
import pytest

from app.agent.planners import (
    SWEEP_PLAN,
    UNIFORM_PRIOR_REASON,
    InfoGainPlanner,
    RandomPlanner,
    SweepPlanner,
    rule_planner,
)
from app.cases import CaseView
from app.inference.engine import CANDIDATES, Candidate, initial_belief

CASE = CaseView("case-test", "Test", "A note.")


def _choose(planner, remaining: int = 8, done=(), seed: int = 0):
    return planner.choose(initial_belief(), remaining, list(done), np.random.default_rng(seed), [])


@pytest.mark.parametrize("name", ["info_gain", "sweep", "random"])
def test_rule_planners_use_uniform_prior(name: str) -> None:
    planner = rule_planner(name)
    assert planner.name == name
    assert planner.prior(CASE) == (None, UNIFORM_PRIOR_REASON)
    assert planner.events == []


def test_unknown_rule_planner() -> None:
    with pytest.raises(ValueError):
        rule_planner("meta")


def test_info_gain_reports_bits() -> None:
    choice = _choose(InfoGainPlanner())
    assert choice is not None
    assert choice.chosen_by == "info_gain"
    assert choice.information_bits is not None and choice.information_bits > 0


@pytest.mark.parametrize("planner_type", [InfoGainPlanner, SweepPlanner, RandomPlanner])
def test_planners_respect_budget_and_repeats(planner_type) -> None:
    done = [Candidate(900.0, 0.0), Candidate(1500.0, 0.0)]
    choice = _choose(planner_type(), remaining=1, done=done)
    assert choice is not None
    assert choice.candidate not in done
    assert choice.candidate.cost <= 1


@pytest.mark.parametrize("planner_type", [InfoGainPlanner, SweepPlanner, RandomPlanner])
def test_planners_return_none_when_nothing_affordable(planner_type) -> None:
    assert _choose(planner_type(), remaining=0) is None
    assert _choose(planner_type(), remaining=8, done=CANDIDATES) is None


def test_sweep_follows_plan_in_order() -> None:
    assert _choose(SweepPlanner()).candidate == SWEEP_PLAN[0]
    assert _choose(SweepPlanner(), done=SWEEP_PLAN[:2]).candidate == SWEEP_PLAN[2]


def test_sweep_skips_unaffordable_points() -> None:
    # Point 3 (4500 RPM) costs 2; with 1 point left the sweep moves on to point 4.
    choice = _choose(SweepPlanner(), remaining=1, done=SWEEP_PLAN[:2])
    assert choice.candidate == SWEEP_PLAN[3]


def test_sweep_stops_after_its_plan() -> None:
    assert _choose(SweepPlanner(), remaining=8, done=SWEEP_PLAN) is None


def test_random_is_seeded() -> None:
    first = [_choose(RandomPlanner(), seed=s).candidate for s in range(5)]
    again = [_choose(RandomPlanner(), seed=s).candidate for s in range(5)]
    assert first == again
    assert len(set(first)) > 1
