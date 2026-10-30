"""Bayesian engine: the only source of probabilities in FailureLab AI.

Beliefs are weights over a fixed grid of 990 particles. Each particle is one hypothesis
with concrete fault severities and machine values (critical speed, thermal factor). The
engine imports only the physics model; it never sees a hidden case. Formulas follow
docs/TECHNICAL_DESIGN.md §6.

Complexity, with N = 990 particles, C candidates and S = 64 simulated outcomes:
- `update` and `update_alarm`: O(N), one vectorised physics call.
- `expected_information_gain`: O(C · S · N) time and memory, fully vectorised
  (24 · 64 · 990 ≈ 1.5 M likelihood terms for a full candidate set).
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from itertools import product
from typing import NamedTuple

import numpy as np
from numpy.typing import NDArray

from app.physics.model import Features, Response, noisy_features, overall_rms, predict

Array = NDArray[np.float64]

HEALTHY = "healthy"
HYPOTHESES = (
    HEALTHY,
    "imbalance",
    "misalignment",
    "friction",
    "imbalance+friction",
    "imbalance+misalignment",
)
FAULT_NAMES = ("imbalance", "misalignment", "friction")

SEVERITY_GRID = (0.15, 0.3, 0.5, 0.75, 1.0)
WN_GRID_RPM = (3300.0, 3450.0, 3600.0, 3750.0, 3900.0)
THERMAL_GRID = (0.75, 1.0, 1.3)

# Gaussian error model on the features (TECHNICAL_DESIGN.md §6).
LOG_AMP_SIGMA = 0.354
LOG_BROADBAND_SIGMA = 0.206
TEMP_ABS_SIGMA_C = 1.5
TEMP_REL_SIGMA = 0.10
ALARM_LOG_SIGMA = 0.354

EIG_SAMPLES = 64

# Shared experiment rules for every planner.
CANDIDATE_RPMS = (900.0, 1500.0, 2100.0, 2700.0, 3300.0, 3900.0, 4500.0, 5100.0)
CANDIDATE_LOADS_N = (0.0, 1000.0, 2000.0)
HIGH_SPEED_RPM = 4000.0
BUDGET = 8
CONFIDENCE_TARGET = 0.90


@dataclass(frozen=True)
class Candidate:
    """An experiment the investigator may run: one operating point."""

    rpm: float
    load_n: float

    @property
    def cost(self) -> int:
        return 2 if self.rpm > HIGH_SPEED_RPM else 1


CANDIDATES = tuple(Candidate(rpm, load) for rpm, load in product(CANDIDATE_RPMS, CANDIDATE_LOADS_N))


@dataclass(frozen=True)
class ScoredCandidate:
    candidate: Candidate
    information_bits: float

    @property
    def information_per_cost(self) -> float:
        return self.information_bits / self.candidate.cost


class Particles(NamedTuple):
    """Parallel arrays, one entry per particle."""

    hypothesis: NDArray[np.int64]
    imbalance: Array
    misalignment: Array
    friction: Array
    wn_rpm: Array
    thermal: Array


def _faults_of(hypothesis: str) -> tuple[str, ...]:
    return () if hypothesis == HEALTHY else tuple(hypothesis.split("+"))


def build_particles() -> Particles:
    """Grid of severities per present fault, critical speeds and thermal factors."""
    rows: list[tuple[int, float, float, float, float, float]] = []
    for h_index, hypothesis in enumerate(HYPOTHESES):
        present = _faults_of(hypothesis)
        for severities in product(SEVERITY_GRID, repeat=len(present)):
            faults = dict.fromkeys(FAULT_NAMES, 0.0) | dict(zip(present, severities, strict=True))
            for wn, thermal in product(WN_GRID_RPM, THERMAL_GRID):
                fault_values = tuple(faults[name] for name in FAULT_NAMES)
                rows.append((h_index, *fault_values, wn, thermal))
    columns = np.array(rows, dtype=float).T
    return Particles(columns[0].astype(np.int64), *columns[1:])


PARTICLES = build_particles()
N_PARTICLES = PARTICLES.hypothesis.size
# One-hot (N, H) matrix: particle weights @ ONE_HOT gives hypothesis probabilities.
ONE_HOT = np.eye(len(HYPOTHESES))[PARTICLES.hypothesis]
PARTICLE_COUNTS = ONE_HOT.sum(axis=0)


def _log_normalise(log_w: Array) -> Array:
    """Normalise log weights along the last axis (log-sum-exp)."""
    peak = np.max(log_w, axis=-1, keepdims=True)
    return log_w - (peak + np.log(np.sum(np.exp(log_w - peak), axis=-1, keepdims=True)))


@dataclass(frozen=True)
class Belief:
    """Normalised log weights over PARTICLES."""

    log_weights: Array

    def probabilities(self) -> Array:
        """Probability of each hypothesis, in HYPOTHESES order."""
        return np.exp(self.log_weights) @ ONE_HOT

    def as_dict(self) -> dict[str, float]:
        return dict(zip(HYPOTHESES, (float(p) for p in self.probabilities()), strict=True))

    def top(self) -> tuple[str, float]:
        probs = self.probabilities()
        best = int(np.argmax(probs))
        return HYPOTHESES[best], float(probs[best])


def initial_belief(prior: Mapping[str, float] | None = None) -> Belief:
    """Spread each hypothesis's prior evenly over its particles. None means uniform."""
    if prior is None:
        probs = np.full(len(HYPOTHESES), 1.0 / len(HYPOTHESES))
    else:
        unknown = set(prior) - set(HYPOTHESES)
        if unknown:
            raise ValueError(f"unknown hypotheses: {sorted(unknown)}")
        probs = np.array([prior.get(h, 0.0) for h in HYPOTHESES], dtype=float)
        if np.any(probs < 0) or probs.sum() <= 0:
            raise ValueError("prior must be non-negative with a positive sum")
        probs = probs / probs.sum()
    with np.errstate(divide="ignore"):
        log_w = np.log(probs[PARTICLES.hypothesis] / PARTICLE_COUNTS[PARTICLES.hypothesis])
    return Belief(_log_normalise(log_w))


def predict_particles(rpm: float | Array, load_n: float | Array) -> Response:
    """Noise-free response of every particle; rpm/load of shape (C, 1) give (C, N)."""
    return predict(
        imbalance=PARTICLES.imbalance,
        misalignment=PARTICLES.misalignment,
        friction=PARTICLES.friction,
        wn_rpm=PARTICLES.wn_rpm,
        thermal=PARTICLES.thermal,
        rpm=rpm,
        load_n=load_n,
    )


def _gauss(residual: Array, sigma: Array | float) -> Array:
    return -0.5 * (residual / sigma) ** 2 - np.log(sigma)


def feature_log_likelihood(
    predicted: Response, amp_1x: Array, amp_2x: Array, broadband: Array, temp_rise: Array
) -> Array:
    """Log likelihood of measured features under each prediction; arrays broadcast."""
    temp_sigma = np.sqrt(TEMP_ABS_SIGMA_C**2 + (TEMP_REL_SIGMA * predicted.temp_rise_c) ** 2)
    return (
        _gauss(np.log1p(amp_1x) - np.log1p(predicted.amp_1x_um), LOG_AMP_SIGMA)
        + _gauss(np.log1p(amp_2x) - np.log1p(predicted.amp_2x_um), LOG_AMP_SIGMA)
        + _gauss(np.log(broadband) - np.log(predicted.broadband_um), LOG_BROADBAND_SIGMA)
        + _gauss(temp_rise - predicted.temp_rise_c, temp_sigma)
    )


def update(belief: Belief, rpm: float, load_n: float, features: Features) -> Belief:
    """Posterior after one measured experiment."""
    log_lik = feature_log_likelihood(
        predict_particles(rpm, load_n),
        np.float64(features.amp_1x_um),
        np.float64(features.amp_2x_um),
        np.float64(features.broadband_um),
        np.float64(features.temp_rise_c),
    )
    return Belief(_log_normalise(belief.log_weights + log_lik))


def update_alarm(belief: Belief, rpm: float, load_n: float, overall_rms_um: float) -> Belief:
    """Posterior after the alarm, which reports only overall vibration RMS."""
    pred = predict_particles(rpm, load_n)
    predicted_rms = overall_rms(pred.amp_1x_um, pred.amp_2x_um, pred.broadband_um)
    log_lik = _gauss(np.log(overall_rms_um) - np.log(predicted_rms), ALARM_LOG_SIGMA)
    return Belief(_log_normalise(belief.log_weights + log_lik))


def entropy_bits(probs: Array) -> Array:
    """Shannon entropy in bits along the last axis."""
    safe = np.where(probs > 0, probs, 1.0)
    return -np.sum(probs * np.log2(safe), axis=-1)


def expected_information_gain(
    belief: Belief,
    candidates: Iterable[Candidate],
    rng: np.random.Generator,
    samples: int = EIG_SAMPLES,
) -> Array:
    """Expected drop in hypothesis entropy (bits) for each candidate, by simulation.

    For each candidate: draw `samples` particles by weight, simulate a noisy measurement
    from each (feature-level noise only, D-25), compute the posterior for every outcome
    and average its entropy. Monte Carlo can dip slightly below zero; results are clipped
    at 0 because true expected information gain is never negative.
    """
    cands = list(candidates)
    if not cands:
        return np.zeros(0)
    rpm = np.array([[c.rpm] for c in cands])
    load = np.array([[c.load_n] for c in cands])
    pred = predict_particles(rpm, load)  # fields of shape (C, N)
    weights = np.exp(belief.log_weights)
    drawn = rng.choice(N_PARTICLES, size=(len(cands), samples), p=weights / weights.sum())
    truth = Response(*(np.take_along_axis(field, drawn, axis=1) for field in pred))
    outcome = noisy_features(truth, rng)  # fields of shape (C, S)
    log_lik = feature_log_likelihood(
        Response(*(field[:, None, :] for field in pred)),
        outcome.amp_1x_um[:, :, None],
        outcome.amp_2x_um[:, :, None],
        outcome.broadband_um[:, :, None],
        outcome.temp_rise_c[:, :, None],
    )
    posterior = np.exp(_log_normalise(belief.log_weights + log_lik)) @ ONE_HOT  # (C, S, H)
    gain = entropy_bits(belief.probabilities()) - entropy_bits(posterior).mean(axis=1)
    return np.maximum(gain, 0.0)


def affordable_candidates(remaining_budget: int, done: Iterable[Candidate]) -> list[Candidate]:
    """Untried candidates whose cost fits the remaining budget, in CANDIDATES order."""
    tried = set(done)
    return [c for c in CANDIDATES if c not in tried and c.cost <= remaining_budget]


def rank_candidates(
    belief: Belief,
    remaining_budget: int,
    done: Iterable[Candidate],
    rng: np.random.Generator,
) -> list[ScoredCandidate]:
    """Affordable untried candidates, best information per cost first (stable on ties)."""
    options = affordable_candidates(remaining_budget, done)
    gains = expected_information_gain(belief, options, rng)
    scored = [ScoredCandidate(c, float(g)) for c, g in zip(options, gains, strict=True)]
    return sorted(scored, key=lambda s: -s.information_per_cost)


def predictions_by_hypothesis(
    belief: Belief, rpm: float, load_n: float
) -> dict[str, dict[str, float]]:
    """What each hypothesis expects at an operating point: belief-weighted mean of its
    particles' noise-free 1x, 2x and temperature rise."""
    pred = predict_particles(rpm, load_n)
    result = {}
    for h_index, hypothesis in enumerate(HYPOTHESES):
        mask = PARTICLES.hypothesis == h_index
        log_w = belief.log_weights[mask]
        peak = np.max(log_w)
        # A hypothesis with zero weight still gets a prediction: its plain particle mean.
        w = np.exp(log_w - peak) if np.isfinite(peak) else np.ones_like(log_w)
        w /= w.sum()
        result[hypothesis] = {
            "amp_1x_um": float(w @ pred.amp_1x_um[mask]),
            "amp_2x_um": float(w @ pred.amp_2x_um[mask]),
            "temp_rise_c": float(w @ pred.temp_rise_c[mask]),
        }
    return result
