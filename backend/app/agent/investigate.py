"""The investigation loop: alarm, experiments, stopping, diagnosis and trace.

The loop receives a public CaseView and a `run(rpm, load_n, i)` callable, never a hidden
Scenario. Every measurement comes from `run`, every probability from the engine. With the
same case, planner and seed, a rule-planner trace is bit-identical. All data is simulated.
"""

from collections.abc import Iterable
from dataclasses import asdict
from datetime import datetime
from typing import Any

import numpy as np

from app.agent.planners import Planner, Trace
from app.cases import CaseView
from app.inference.engine import (
    BUDGET,
    CONFIDENCE_TARGET,
    Belief,
    Candidate,
    initial_belief,
    predictions_by_hypothesis,
    update,
    update_alarm,
)
from app.physics.model import MODEL_VERSION, Measurement, overall_rms, spectrum, waveform_preview
from app.runner import Run

SOURCE = "simulation"
DOUBT_THRESHOLD = 0.05
DECIMALS = 4

RECOMMENDED_CHECKS = {
    "healthy": "No fault indicated: keep routine monitoring and recheck if the alarm repeats.",
    "imbalance": "Check rotor balance: look for loose or missing balance weights, then "
    "trim-balance.",
    "misalignment": "Check shaft alignment at the coupling and the motor mounting.",
    "friction": "Check bearing lubrication and condition, re-grease and watch the "
    "temperature trend.",
}


def investigation_id(case_id: str, planner: str, seed: int, now: datetime | None = None) -> str:
    """Rule planners: `{case}-{planner}-{seed}`; Meta adds a timestamp (D-20)."""
    base = f"{case_id}-{planner}-{seed}"
    return f"{base}-{now:%Y%m%d%H%M%S}" if now is not None else base


def recommended_check(hypothesis: str) -> str:
    return " ".join(RECOMMENDED_CHECKS[part] for part in hypothesis.split("+"))


def rounded(values: np.ndarray) -> list[float]:
    return [round(float(v), DECIMALS) for v in values]


def feature_fields(measurement: Measurement) -> dict[str, float]:
    return {k: round(v, DECIMALS) for k, v in asdict(measurement.features).items()}


def _probabilities(belief: Belief) -> dict[str, float]:
    return {h: round(p, 6) for h, p in belief.as_dict().items()}


def signal_fields(measurement: Measurement) -> dict[str, list[float]]:
    """Waveform preview and spectrum, rounded, as stored in traces and API responses."""
    time_s, displacement = waveform_preview(measurement.displacement_um, measurement.sample_rate_hz)
    freq, amp = spectrum(measurement.displacement_um, measurement.sample_rate_hz)
    return {
        "time_s": rounded(time_s),
        "displacement_um": rounded(displacement),
        "spectrum_freq_hz": rounded(freq),
        "spectrum_amp_um": rounded(amp),
    }


def _alarm(case: CaseView, run: Run, belief: Belief) -> tuple[Belief, Trace]:
    measurement = run(case.initial_rpm, case.initial_load_n, 0)
    f = measurement.features
    rms = float(overall_rms(f.amp_1x_um, f.amp_2x_um, f.broadband_um))
    belief = update_alarm(belief, case.initial_rpm, case.initial_load_n, rms)
    record = {
        "rpm": case.initial_rpm,
        "load_n": case.initial_load_n,
        "overall_rms_um": round(rms, DECIMALS),
        "posterior": _probabilities(belief),
    }
    return belief, record


def _diagnosis(belief: Belief) -> dict[str, Any]:
    ranked = sorted(belief.as_dict().items(), key=lambda item: -item[1])
    top, probability = ranked[0]
    return {
        "top": top,
        "probability": round(probability, 6),
        "confident": probability >= CONFIDENCE_TARGET,
        "ranked": [{"hypothesis": h, "probability": round(p, 6)} for h, p in ranked],
        "remaining_doubts": [
            {"hypothesis": h, "probability": round(p, 6)}
            for h, p in ranked[1:]
            if p >= DOUBT_THRESHOLD
        ],
        "recommended_check": recommended_check(top),
        "explanation": "",
    }


def _stop_reason(belief: Belief, remaining: int) -> str | None:
    if belief.top()[1] >= CONFIDENCE_TARGET:
        return "confident"
    if remaining <= 0:
        return "budget"
    return None


def investigate_frames(
    case: CaseView,
    run: Run,
    planner: Planner,
    seed: int,
    *,
    budget: int = BUDGET,
    trace_id: str | None = None,
) -> Iterable[dict[str, Any]]:
    """Yield one frame per investigation phase, then the complete trace.

    Frames: prior, alarm, then for each experiment choice/predict/result/update,
    then diagnosis, then a final ``trace`` frame holding the full replayable trace.
    Used by the SSE stream endpoint so a dashboard can render frames live as they
    are produced. `investigate()` collects these frames into the same trace dict.
    """
    tid = trace_id or investigation_id(case.case_id, planner.name, seed)
    base = {
        "investigation_id": tid,
        "case": asdict(case),
        "planner": planner.name,
        "seed": seed,
    }

    prior, prior_reason = planner.prior(case)
    belief = initial_belief(prior)
    prior_probs = _probabilities(belief)
    belief, alarm = _alarm(case, run, belief)

    yield {"kind": "prior", **base, "prior": {"probabilities": prior_probs, "reason": prior_reason}}
    yield {
        "kind": "alarm",
        **base,
        "alarm": {
            "rpm": alarm["rpm"],
            "load_n": alarm["load_n"],
            "overall_rms_um": alarm["overall_rms_um"],
            "posterior": alarm["posterior"],
        },
    }

    rng = np.random.default_rng([seed, 1])
    done: list[Candidate] = []
    steps: list[Trace] = []
    remaining = budget
    stop_reason = _stop_reason(belief, remaining)
    while stop_reason is None:
        choice = planner.choose(belief, remaining, done, rng, steps)
        if choice is None:
            stop_reason = "no_affordable_experiment"
            break
        candidate = choice.candidate
        predictions = predictions_by_hypothesis(belief, candidate.rpm, candidate.load_n)
        step_index = len(steps) + 1

        yield {
            "kind": "choice",
            **base,
            "step": step_index,
            "candidate": {
                "rpm": candidate.rpm,
                "load_n": candidate.load_n,
                "cost": candidate.cost,
            },
            "chosen_by": choice.chosen_by,
            "rationale": choice.rationale,
            "information_bits": None
            if choice.information_bits is None
            else round(choice.information_bits, 6),
            "expectations": choice.expectations,
        }
        yield {
            "kind": "predict",
            **base,
            "step": step_index,
            "predictions": {
                h: {k: round(v, DECIMALS) for k, v in p.items()} for h, p in predictions.items()
            },
        }

        measurement = run(candidate.rpm, candidate.load_n, step_index)
        belief = update(belief, candidate.rpm, candidate.load_n, measurement.features)
        done.append(candidate)
        remaining -= candidate.cost
        step: Trace = {
            "index": step_index,
            "rpm": candidate.rpm,
            "load_n": candidate.load_n,
            "cost": candidate.cost,
            "chosen_by": choice.chosen_by,
            "rationale": choice.rationale,
            "information_bits": None
            if choice.information_bits is None
            else round(choice.information_bits, 6),
            "expectations": choice.expectations,
            "predictions": {
                h: {k: round(v, DECIMALS) for k, v in p.items()} for h, p in predictions.items()
            },
            "measured": feature_fields(measurement),
            "signals": signal_fields(measurement),
            "posterior": _probabilities(belief),
            "budget_remaining": remaining,
        }
        steps.append(step)

        yield {"kind": "result", **base, "step": step}
        yield {"kind": "update", **base, "step": step}

        stop_reason = _stop_reason(belief, remaining)

    diagnosis = _diagnosis(belief)
    trace: Trace = {
        **base,
        "source": SOURCE,
        "model_version": MODEL_VERSION,
        "prior": {"probabilities": prior_probs, "reason": prior_reason},
        "alarm": alarm,
        "steps": steps,
        "experiments": len(steps),
        "cost": budget - remaining,
        "budget": budget,
        "stop_reason": stop_reason,
        "diagnosis": diagnosis,
        "llm_events": planner.events,
    }
    diagnosis["explanation"] = planner.explain(trace)
    yield {
        "kind": "diagnosis",
        **base,
        "diagnosis": diagnosis,
        "stop_reason": stop_reason,
        "experiments": len(steps),
        "cost": budget - remaining,
    }
    yield {"kind": "trace", **base, "trace": trace}


def investigate(
    case: CaseView,
    run: Run,
    planner: Planner,
    seed: int,
    *,
    budget: int = BUDGET,
    trace_id: str | None = None,
) -> Trace:
    """Run one investigation and return its replayable trace.

    Collects frames from `investigate_frames()` into a single trace; behavior is
    identical to the previous implementation.
    """
    trace: Trace | None = None
    for frame in investigate_frames(case, run, planner, seed, budget=budget, trace_id=trace_id):
        if frame["kind"] == "trace":
            trace = frame["trace"]
    if trace is None:  # pragma: no cover - investigate_frames always yields a trace frame
        raise RuntimeError("investigate_frames produced no trace")
    return trace
