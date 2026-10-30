"""Planners choose the next experiment; the engine still computes every probability.

`info_gain` is the fallback for the Meta model and a baseline; `sweep` is an engineer's
fixed plan; `random` proves that informed choices matter. All share the engine's
candidates, budget and stopping rule (TECHNICAL_DESIGN.md §6-7).
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

import numpy as np

from app.cases import CaseView
from app.inference.engine import Belief, Candidate, affordable_candidates, rank_candidates

Trace = dict[str, Any]
UNIFORM_PRIOR_REASON = "Uniform prior: rule-based planners do not read the maintenance note."

SWEEP_PLAN = tuple(
    Candidate(rpm, load)
    for rpm, load in (
        (1500.0, 0.0),
        (3300.0, 0.0),
        (4500.0, 0.0),
        (1500.0, 2000.0),
        (3300.0, 2000.0),
        (4500.0, 2000.0),
        (900.0, 1000.0),
        (2700.0, 1000.0),
        (3900.0, 1000.0),
        (5100.0, 1000.0),
    )
)


@dataclass(frozen=True)
class Choice:
    """A chosen experiment and why. `expectations` holds the planner's stated expected
    result per hypothesis (Meta model only)."""

    candidate: Candidate
    chosen_by: str
    rationale: str
    information_bits: float | None = None
    expectations: dict[str, str] | None = None


class Planner(Protocol):
    name: str
    events: list[dict[str, Any]]

    def prior(self, case: CaseView) -> tuple[dict[str, float] | None, str]: ...

    def choose(
        self,
        belief: Belief,
        remaining: int,
        done: Sequence[Candidate],
        rng: np.random.Generator,
        steps: Sequence[Trace],
    ) -> Choice | None: ...

    def explain(self, trace: Trace) -> str: ...


def template_explanation(trace: Trace) -> str:
    """Plain-language summary built only from the trace's evidence."""
    diagnosis = trace["diagnosis"]
    steps = trace["steps"]
    text = (
        f"After {len(steps)} simulated experiment{'' if len(steps) == 1 else 's'} costing "
        f"{trace['cost']} of "
        f"{trace['budget']} points, the engine rates {diagnosis['top']} most likely at "
        f"{diagnosis['probability']:.0%}."
    )
    if steps:
        last = steps[-1]["measured"]
        text += (
            f" The last reading at {steps[-1]['rpm']:.0f} RPM and {steps[-1]['load_n']:.0f} N "
            f"showed 1x {last['amp_1x_um']:.1f} µm, 2x {last['amp_2x_um']:.1f} µm and a "
            f"temperature rise of {last['temp_rise_c']:.1f} °C."
        )
    if diagnosis["remaining_doubts"]:
        doubts = ", ".join(d["hypothesis"] for d in diagnosis["remaining_doubts"])
        text += f" Not yet ruled out: {doubts}."
    return text


@dataclass
class _RulePlanner:
    name: str = ""
    events: list[dict[str, Any]] = field(default_factory=list)

    def prior(self, case: CaseView) -> tuple[dict[str, float] | None, str]:
        return None, UNIFORM_PRIOR_REASON

    def explain(self, trace: Trace) -> str:
        return template_explanation(trace)


@dataclass
class InfoGainPlanner(_RulePlanner):
    """Greedy: the affordable untried candidate with the most expected information per cost."""

    name: str = "info_gain"

    def choose(
        self,
        belief: Belief,
        remaining: int,
        done: Sequence[Candidate],
        rng: np.random.Generator,
        steps: Sequence[Trace],
    ) -> Choice | None:
        ranked = rank_candidates(belief, remaining, done, rng)
        if not ranked:
            return None
        best = ranked[0]
        return Choice(
            best.candidate,
            self.name,
            f"Most expected information per cost point: {best.information_bits:.2f} bits "
            f"for {best.candidate.cost} point(s).",
            best.information_bits,
        )


@dataclass
class SweepPlanner(_RulePlanner):
    """Fixed plan, in order, skipping points it cannot afford or has already run."""

    name: str = "sweep"

    def choose(
        self,
        belief: Belief,
        remaining: int,
        done: Sequence[Candidate],
        rng: np.random.Generator,
        steps: Sequence[Trace],
    ) -> Choice | None:
        for position, candidate in enumerate(SWEEP_PLAN, start=1):
            if candidate not in done and candidate.cost <= remaining:
                rationale = f"Fixed sweep point {position} of {len(SWEEP_PLAN)}."
                return Choice(candidate, self.name, rationale)
        return None


@dataclass
class RandomPlanner(_RulePlanner):
    """Any affordable untried candidate, drawn from the investigation's seeded generator."""

    name: str = "random"

    def choose(
        self,
        belief: Belief,
        remaining: int,
        done: Sequence[Candidate],
        rng: np.random.Generator,
        steps: Sequence[Trace],
    ) -> Choice | None:
        options = affordable_candidates(remaining, done)
        if not options:
            return None
        candidate = options[int(rng.integers(len(options)))]
        return Choice(candidate, self.name, "Random affordable experiment (baseline).")


RULE_PLANNERS = {"info_gain": InfoGainPlanner, "sweep": SweepPlanner, "random": RandomPlanner}


def rule_planner(name: str) -> Planner:
    try:
        return RULE_PLANNERS[name]()
    except KeyError:
        raise ValueError(f"unknown rule planner {name!r}") from None
