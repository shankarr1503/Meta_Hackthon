"""Hidden scenarios (ground truth) and the public CaseView.

A `Scenario` holds the true faults and machine values. Only `app/runner.py` and the API may
read Scenario objects; the investigation receives a `CaseView` and a run callable. All cases
are simulated.
"""

from dataclasses import dataclass

import numpy as np

from app.physics.model import Faults, Machine

INITIAL_RPM = 2950.0
INITIAL_LOAD_N = 500.0

HEALTHY = "healthy"
IMBALANCE = "imbalance"
MISALIGNMENT = "misalignment"
FRICTION = "friction"
IMBALANCE_FRICTION = "imbalance+friction"
IMBALANCE_MISALIGNMENT = "imbalance+misalignment"
TRUTH_LABELS = (
    HEALTHY,
    IMBALANCE,
    MISALIGNMENT,
    FRICTION,
    IMBALANCE_FRICTION,
    IMBALANCE_MISALIGNMENT,
)

# Ranges for generated cases; hidden machine values deliberately fall off the engine's grid.
RANDOM_SEVERITY = (0.15, 0.8)
RANDOM_WN_RPM = (3300.0, 3900.0)
RANDOM_THERMAL = (0.7, 1.4)
RANDOM_NOTE = "No maintenance history is available for this machine."


@dataclass(frozen=True)
class CaseView:
    """The only case information an investigator may see."""

    case_id: str
    title: str
    note: str
    initial_rpm: float = INITIAL_RPM
    initial_load_n: float = INITIAL_LOAD_N


@dataclass(frozen=True)
class Scenario:
    """A hidden case: public description plus ground truth."""

    case_id: str
    title: str
    note: str
    faults: Faults
    machine: Machine

    @property
    def truth(self) -> str:
        return truth_label(self.faults)

    def view(self) -> CaseView:
        return CaseView(case_id=self.case_id, title=self.title, note=self.note)


def truth_label(faults: Faults) -> str:
    """Name of the hypothesis a fault set belongs to."""
    present = tuple(
        name
        for name, severity in (
            (IMBALANCE, faults.imbalance),
            (MISALIGNMENT, faults.misalignment),
            (FRICTION, faults.friction),
        )
        if severity > 0
    )
    label = "+".join(present) or HEALTHY
    if label not in TRUTH_LABELS:
        raise ValueError(f"fault combination {label!r} is not a modelled hypothesis")
    return label


SEALED_CASES: tuple[Scenario, ...] = (
    Scenario(
        "case-k7",
        "Pump drive A",
        "During cleaning, a small balance weight was found loose inside the guard.",
        Faults(imbalance=0.30),
        Machine(wn_rpm=3550.0, thermal=1.25),
    ),
    Scenario(
        "case-r2",
        "Conveyor gearbox input",
        "Vibration started after the motor was re-mounted on a new base plate.",
        Faults(misalignment=0.35),
        Machine(wn_rpm=3720.0, thermal=0.80),
    ),
    Scenario(
        "case-m9",
        "Blower shaft",
        "A lubrication interval was missed; the bearing housing feels warm to the touch.",
        Faults(friction=0.30),
        Machine(wn_rpm=3400.0, thermal=0.80),
    ),
    Scenario(
        "case-t4",
        "Mixer spindle",
        "Vibration has crept up over months and the housing runs warmer than its twin machine.",
        Faults(imbalance=0.40, friction=0.25),
        Machine(wn_rpm=3650.0, thermal=1.20),
    ),
    Scenario(
        "case-b6",
        "Compressor coupling",
        "The coupling was replaced and the rotor had a minor weld repair in the same outage.",
        Faults(imbalance=0.35, misalignment=0.25),
        Machine(wn_rpm=3480.0, thermal=1.00),
    ),
    Scenario(
        "case-x1",
        "Test-bench motor",
        'An operator says it "sounds different" at full speed. Nothing was serviced recently.',
        Faults(),
        Machine(wn_rpm=3800.0, thermal=1.35),
    ),
)

_SEALED_BY_ID = {case.case_id: case for case in SEALED_CASES}


def get_scenario(case_id: str) -> Scenario | None:
    return _SEALED_BY_ID.get(case_id)


def public_cases() -> list[CaseView]:
    return [case.view() for case in SEALED_CASES]


def _random_faults(label: str, rng: np.random.Generator) -> Faults:
    parts = [] if label == HEALTHY else label.split("+")
    severities = {name: float(rng.uniform(*RANDOM_SEVERITY)) for name in parts}
    return Faults(**severities)


def random_scenarios(per_hypothesis: int, seed: int) -> list[Scenario]:
    """Generated benchmark cases: `per_hypothesis` of each label, reproducible for a seed."""
    rng = np.random.default_rng(seed)
    scenarios = []
    for label in TRUTH_LABELS:
        for _ in range(per_hypothesis):
            index = len(scenarios)
            machine = Machine(
                wn_rpm=float(rng.uniform(*RANDOM_WN_RPM)),
                thermal=float(rng.uniform(*RANDOM_THERMAL)),
            )
            scenarios.append(
                Scenario(
                    f"rand-{seed}-{index:03d}",
                    f"Generated machine {index + 1}",
                    RANDOM_NOTE,
                    _random_faults(label, rng),
                    machine,
                )
            )
    return scenarios
