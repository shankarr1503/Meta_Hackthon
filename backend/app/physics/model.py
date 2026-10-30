"""Simulated rotor twin: a single-mass, Jeffcott-style rotor in steady state.

The only source of numbers in FailureLab AI. All data is simulated. This module imports
nothing from the rest of the app. Formulas follow docs/TECHNICAL_DESIGN.md §5; every
modelling simplification is listed in docs/ASSUMPTIONS.md.

`predict` is vectorised: every argument may be a scalar or a NumPy array, and arrays
broadcast together, so the inference engine can evaluate all particles in one call
(O(n) in the number of particles, no Python loops).
"""

from dataclasses import dataclass
from typing import NamedTuple

import numpy as np
from numpy.typing import ArrayLike, NDArray

MODEL_VERSION = "rotor-1"

MASS_KG = 10.0
METRES_TO_UM = 1e6
SENSOR_NOISE_UM = 2.0

# Measurement error, applied as random factors on the true features.
AMP_LOG_SPREAD = 0.35
FRICTION_BROADBAND_LOG_SPREAD = 0.20
TEMP_REL_SPREAD = 0.10
TEMP_ABS_NOISE_C = 1.5

DEFAULT_DURATION_S = 1.0
DEFAULT_SAMPLE_RATE_HZ = 5000.0
MIN_SAMPLES = 16

Array = NDArray[np.float64]


@dataclass(frozen=True)
class Faults:
    """Fault severities, each from 0 (absent) to 1 (severe)."""

    imbalance: float = 0.0
    misalignment: float = 0.0
    friction: float = 0.0


@dataclass(frozen=True)
class Machine:
    """Machine properties: first critical speed (RPM) and bearing thermal factor."""

    wn_rpm: float
    thermal: float


class Response(NamedTuple):
    """Noise-free steady-state response. Amplitudes are peak values in µm."""

    amp_1x_um: Array
    amp_2x_um: Array
    broadband_friction_um: Array
    broadband_um: Array
    temp_rise_c: Array


@dataclass(frozen=True)
class Features:
    """Measured features of one experiment. `temp_rise_c` is the rise above ambient."""

    amp_1x_um: float
    amp_2x_um: float
    broadband_um: float
    temp_rise_c: float


@dataclass(frozen=True)
class Measurement:
    """One simulated experiment: extracted features and the raw displacement signal."""

    rpm: float
    load_n: float
    features: Features
    sample_rate_hz: float
    displacement_um: Array


def _dynamic_factor(x: Array, zeta: Array) -> Array:
    return np.sqrt((1.0 - x**2) ** 2 + (2.0 * zeta * x) ** 2)


def broadband_total(friction_um: ArrayLike) -> Array:
    """Total broadband RMS: friction broadband combined with the sensor noise floor."""
    return np.sqrt(np.asarray(friction_um, dtype=float) ** 2 + SENSOR_NOISE_UM**2)


def predict(
    *,
    imbalance: ArrayLike,
    misalignment: ArrayLike,
    friction: ArrayLike,
    wn_rpm: ArrayLike,
    thermal: ArrayLike,
    rpm: ArrayLike,
    load_n: ArrayLike,
) -> Response:
    """Noise-free response for any broadcastable mix of faults, machines and operating points."""
    imb, mis, fric = (np.asarray(v, dtype=float) for v in (imbalance, misalignment, friction))
    wn, therm = np.asarray(wn_rpm, dtype=float), np.asarray(thermal, dtype=float)
    speed, load = np.asarray(rpm, dtype=float), np.asarray(load_n, dtype=float)

    r = speed / wn
    zeta = 0.03 + 0.08 * fric
    stiffness = MASS_KG * (2.0 * np.pi * wn / 60.0) ** 2
    d_1x = _dynamic_factor(r, zeta)
    d_2x = _dynamic_factor(2.0 * r, zeta)

    unbalance_kg_m = 1e-5 + 2e-4 * imb
    imb_1x = (unbalance_kg_m / MASS_KG) * r**2 / d_1x
    imb_2x = 0.20 * imb_1x

    static_deflection = 30.0 * mis * (1.0 + load / 1500.0) / stiffness
    mis_2x = static_deflection / d_2x
    mis_1x = 0.6 * static_deflection / d_1x

    broadband_friction = 6.0 * fric * speed / 3000.0
    s = speed / 3000.0
    temp = therm * (
        8.0 * s * (1.0 + load / 2000.0)
        + 30.0 * fric * s * (1.0 + load / 1000.0)
        + 6.0 * mis * (1.0 + load / 1500.0)
    )
    return Response(
        amp_1x_um=(imb_1x + mis_1x) * METRES_TO_UM,
        amp_2x_um=(imb_2x + mis_2x) * METRES_TO_UM,
        broadband_friction_um=broadband_friction,
        broadband_um=broadband_total(broadband_friction),
        temp_rise_c=temp,
    )


def predict_for(faults: Faults, machine: Machine, rpm: float, load_n: float) -> Response:
    """Convenience wrapper of `predict` for one fault set and machine."""
    return predict(
        imbalance=faults.imbalance,
        misalignment=faults.misalignment,
        friction=faults.friction,
        wn_rpm=machine.wn_rpm,
        thermal=machine.thermal,
        rpm=rpm,
        load_n=load_n,
    )


def noisy_features(clean: Response, rng: np.random.Generator) -> Response:
    """Apply feature-level measurement error to a (possibly vectorised) clean response.

    Used by `measure` before the signal is synthesised, and by the inference engine to
    simulate outcomes when computing expected information gain.
    """
    shape = np.broadcast(*clean).shape
    z = rng.standard_normal((5, *shape))
    friction_bb = clean.broadband_friction_um * np.exp(FRICTION_BROADBAND_LOG_SPREAD * z[2])
    return Response(
        amp_1x_um=clean.amp_1x_um * np.exp(AMP_LOG_SPREAD * z[0]),
        amp_2x_um=clean.amp_2x_um * np.exp(AMP_LOG_SPREAD * z[1]),
        broadband_friction_um=friction_bb,
        broadband_um=broadband_total(friction_bb),
        temp_rise_c=clean.temp_rise_c * (1.0 + TEMP_REL_SPREAD * z[3]) + TEMP_ABS_NOISE_C * z[4],
    )


def overall_rms(amp_1x_um: ArrayLike, amp_2x_um: ArrayLike, broadband_um: ArrayLike) -> Array:
    """Overall vibration RMS, the single number a monitoring alarm reports."""
    a1, a2 = np.asarray(amp_1x_um, dtype=float), np.asarray(amp_2x_um, dtype=float)
    return np.sqrt((a1**2 + a2**2) / 2.0 + np.asarray(broadband_um, dtype=float) ** 2)


def _time_axis(duration_s: float, sample_rate_hz: float) -> Array:
    n = round(duration_s * sample_rate_hz)
    if n < MIN_SAMPLES:
        raise ValueError(f"signal needs at least {MIN_SAMPLES} samples, got {n}")
    return np.arange(n) / sample_rate_hz


def extract_features(
    signal_um: Array, rpm: float, sample_rate_hz: float
) -> tuple[float, float, float]:
    """Least-squares fit of 1x and 2x sinusoids plus an offset.

    Returns (amp_1x, amp_2x, broadband), where broadband is the RMS of the residual.
    Cost is O(n) in the number of samples (a fixed five-column least-squares problem).
    """
    t = np.arange(signal_um.size) / sample_rate_hz
    columns = [np.ones_like(t)]
    omega = 2.0 * np.pi * rpm / 60.0
    if omega > 0:
        for harmonic in (1.0, 2.0):
            columns += [np.sin(harmonic * omega * t), np.cos(harmonic * omega * t)]
    design = np.column_stack(columns)
    coef, *_ = np.linalg.lstsq(design, signal_um, rcond=None)
    residual = signal_um - design @ coef
    broadband = float(np.sqrt(np.mean(residual**2)))
    if omega <= 0:
        return 0.0, 0.0, broadband
    return float(np.hypot(coef[1], coef[2])), float(np.hypot(coef[3], coef[4])), broadband


def synthesize_signal(
    amp_1x_um: float,
    amp_2x_um: float,
    broadband_friction_um: float,
    rpm: float,
    rng: np.random.Generator,
    duration_s: float = DEFAULT_DURATION_S,
    sample_rate_hz: float = DEFAULT_SAMPLE_RATE_HZ,
) -> Array:
    """Displacement signal: 1x and 2x sinusoids, white broadband and sensor noise (µm)."""
    t = _time_axis(duration_s, sample_rate_hz)
    omega = 2.0 * np.pi * rpm / 60.0
    phase_1x, phase_2x = rng.uniform(0.0, 2.0 * np.pi, size=2)
    harmonics = amp_1x_um * np.sin(omega * t + phase_1x) + amp_2x_um * np.sin(
        2.0 * omega * t + phase_2x
    )
    noise = rng.standard_normal(t.size) * broadband_friction_um
    noise += rng.standard_normal(t.size) * SENSOR_NOISE_UM
    return harmonics + noise


def measure(
    faults: Faults,
    machine: Machine,
    rpm: float,
    load_n: float,
    rng: np.random.Generator,
    duration_s: float = DEFAULT_DURATION_S,
    sample_rate_hz: float = DEFAULT_SAMPLE_RATE_HZ,
) -> Measurement:
    """Run one simulated experiment and extract its features from the signal."""
    noisy = noisy_features(predict_for(faults, machine, rpm, load_n), rng)
    signal = synthesize_signal(
        float(noisy.amp_1x_um),
        float(noisy.amp_2x_um),
        float(noisy.broadband_friction_um),
        rpm,
        rng,
        duration_s,
        sample_rate_hz,
    )
    amp_1x, amp_2x, broadband = extract_features(signal, rpm, sample_rate_hz)
    features = Features(amp_1x, amp_2x, broadband, float(noisy.temp_rise_c))
    return Measurement(rpm, load_n, features, sample_rate_hz, signal)


def spectrum(
    signal_um: Array, sample_rate_hz: float, max_freq_hz: float = 200.0
) -> tuple[Array, Array]:
    """Single-sided amplitude spectrum (Hann window, peak-amplitude scaling) up to max_freq_hz."""
    window = np.hanning(signal_um.size)
    amplitude = 2.0 * np.abs(np.fft.rfft(signal_um * window)) / window.sum()
    freq = np.fft.rfftfreq(signal_um.size, d=1.0 / sample_rate_hz)
    keep = freq <= max_freq_hz
    return freq[keep], amplitude[keep]


def waveform_preview(
    signal_um: Array, sample_rate_hz: float, window_s: float = 0.2, max_points: int = 400
) -> tuple[Array, Array]:
    """The first `window_s` seconds of the signal, decimated to at most `max_points`."""
    count = min(signal_um.size, round(window_s * sample_rate_hz))
    step = max(1, -(-count // max_points))
    idx = np.arange(0, count, step)
    return idx / sample_rate_hz, signal_um[idx]
