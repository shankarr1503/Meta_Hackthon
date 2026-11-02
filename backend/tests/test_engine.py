"""Bayesian engine: particle grid, updates, information gain and predictions."""

import time

import numpy as np
import pytest

from app.cases import TRUTH_LABELS
from app.inference import engine
from app.inference.engine import Candidate
from app.physics.model import Faults, Machine, measure


def _measure(faults: Faults, rpm: float, load: float, seed: int = 1):
    machine = Machine(wn_rpm=3600.0, thermal=1.0)
    return measure(faults, machine, rpm, load, np.random.default_rng(seed)).features


def test_hypotheses_match_case_labels() -> None:
    assert engine.HYPOTHESES == TRUTH_LABELS


def test_particle_grid_has_990_particles() -> None:
    assert engine.N_PARTICLES == 990
    assert engine.PARTICLE_COUNTS.tolist() == [15, 75, 75, 75, 375, 375]


def test_candidates_and_costs() -> None:
    assert len(engine.CANDIDATES) == 24
    assert Candidate(3900.0, 0.0).cost == 1
    assert Candidate(4500.0, 0.0).cost == 2
    assert Candidate(5100.0, 2000.0).cost == 2


def test_uniform_prior() -> None:
    probs = engine.initial_belief().probabilities()
    np.testing.assert_allclose(probs, 1 / 6)


def test_prior_is_renormalised_and_spread_evenly() -> None:
    belief = engine.initial_belief({"imbalance": 3.0, "healthy": 1.0})
    probs = belief.as_dict()
    assert probs["imbalance"] == pytest.approx(0.75)
    assert probs["healthy"] == pytest.approx(0.25)
    assert probs["friction"] == 0.0
    weights = np.exp(belief.log_weights)[engine.PARTICLES.hypothesis == 1]
    np.testing.assert_allclose(weights, 0.75 / 75)


@pytest.mark.parametrize(
    "prior",
    [
        {"bogus": 1.0},
        {"healthy": -1.0},
        {"healthy": 0.0},
        {"healthy": float("nan"), "imbalance": 1.0},
        {"healthy": float("inf")},
    ],
)
def test_invalid_prior_rejected(prior: dict[str, float]) -> None:
    with pytest.raises(ValueError):
        engine.initial_belief(prior)


def test_posterior_sums_to_one() -> None:
    belief = engine.initial_belief()
    for rpm, load in ((1500.0, 0.0), (3300.0, 2000.0)):
        belief = engine.update(belief, rpm, load, _measure(Faults(imbalance=0.5), rpm, load))
        assert belief.probabilities().sum() == pytest.approx(1.0)
        assert np.exp(belief.log_weights).sum() == pytest.approx(1.0)


@pytest.mark.parametrize(
    ("faults", "expected"),
    [
        (Faults(), "healthy"),
        (Faults(imbalance=0.5), "imbalance"),
        (Faults(misalignment=0.5), "misalignment"),
        (Faults(friction=0.5), "friction"),
        (Faults(imbalance=0.5, friction=0.5), "imbalance+friction"),
        (Faults(imbalance=0.5, misalignment=0.5), "imbalance+misalignment"),
    ],
)
def test_correct_hypothesis_wins_on_clean_evidence(faults: Faults, expected: str) -> None:
    belief = engine.initial_belief()
    for seed, (rpm, load) in enumerate(((1500.0, 0.0), (3300.0, 2000.0), (2100.0, 1000.0))):
        belief = engine.update(belief, rpm, load, _measure(faults, rpm, load, seed))
    top, probability = belief.top()
    assert top == expected
    assert probability > 0.5


def test_alarm_update_favours_matching_level() -> None:
    belief = engine.update_alarm(engine.initial_belief(), 2950.0, 500.0, 2.0)
    probs = belief.as_dict()
    assert probs["healthy"] == max(probs.values())


def test_information_gain_is_non_negative_and_seeded() -> None:
    belief = engine.initial_belief()
    gains = engine.expected_information_gain(belief, engine.CANDIDATES, np.random.default_rng(3))
    assert gains.shape == (24,)
    assert np.all(gains >= 0)
    assert gains.max() > 0.3
    again = engine.expected_information_gain(belief, engine.CANDIDATES, np.random.default_rng(3))
    np.testing.assert_array_equal(gains, again)


def test_information_gain_is_near_zero_when_certain() -> None:
    belief = engine.initial_belief({"healthy": 1.0})
    gains = engine.expected_information_gain(belief, engine.CANDIDATES, np.random.default_rng(0))
    np.testing.assert_allclose(gains, 0.0, atol=1e-9)


def test_rank_skips_tried_and_unaffordable() -> None:
    done = [Candidate(900.0, 0.0)]
    ranked = engine.rank_candidates(engine.initial_belief(), 1, done, np.random.default_rng(0))
    chosen = [s.candidate for s in ranked]
    assert Candidate(900.0, 0.0) not in chosen
    assert all(c.cost == 1 for c in chosen)
    assert len(chosen) == 24 - 6 - 1
    scores = [s.information_per_cost for s in ranked]
    assert scores == sorted(scores, reverse=True)


def test_predictions_by_hypothesis_show_signatures() -> None:
    preds = engine.predictions_by_hypothesis(engine.initial_belief(), 3300.0, 2000.0)
    assert set(preds) == set(engine.HYPOTHESES)
    assert preds["imbalance"]["amp_1x_um"] > 5 * preds["healthy"]["amp_1x_um"]
    # Misalignment's 2x peaks near half the critical speed.
    half = engine.predictions_by_hypothesis(engine.initial_belief(), 1500.0, 2000.0)
    ratio = {h: half[h]["amp_2x_um"] / half[h]["amp_1x_um"] for h in half}
    assert ratio["misalignment"] > 1.0 > ratio["imbalance"]
    assert preds["friction"]["temp_rise_c"] > preds["healthy"]["temp_rise_c"]


def test_predictions_handle_zero_weight_hypothesis() -> None:
    preds = engine.predictions_by_hypothesis(engine.initial_belief({"healthy": 1.0}), 1500, 0)
    assert np.isfinite(preds["friction"]["temp_rise_c"])


def test_ranking_all_candidates_is_fast() -> None:
    belief = engine.initial_belief()
    timings = []
    for _ in range(3):  # best of three: robust to scheduler noise on shared CI runners
        start = time.perf_counter()
        engine.rank_candidates(belief, engine.BUDGET, [], np.random.default_rng(0))
        timings.append(time.perf_counter() - start)
    assert min(timings) < 0.5
