"""The only bridge to hidden scenarios.

`make_runner` wraps a Scenario in `run(rpm, load_n, i)`. The investigation loop receives
that callable and a CaseView, never the Scenario itself. Experiment `i` draws its noise from
a generator seeded by (seed, case, i), so a run is reproducible no matter which experiments
came before it.
"""

import zlib
from collections.abc import Callable

import numpy as np

from app.cases import Scenario
from app.physics.model import DEFAULT_DURATION_S, DEFAULT_SAMPLE_RATE_HZ, Measurement, measure

Run = Callable[[float, float, int], Measurement]


def experiment_rng(case_id: str, seed: int, index: int) -> np.random.Generator:
    case_key = zlib.crc32(case_id.encode("utf-8"))
    return np.random.default_rng([seed, case_key, index])


def make_runner(
    scenario: Scenario,
    seed: int,
    duration_s: float = DEFAULT_DURATION_S,
    sample_rate_hz: float = DEFAULT_SAMPLE_RATE_HZ,
) -> Run:
    def run(rpm: float, load_n: float, index: int) -> Measurement:
        rng = experiment_rng(scenario.case_id, seed, index)
        return measure(
            scenario.faults, scenario.machine, rpm, load_n, rng, duration_s, sample_rate_hz
        )

    return run
