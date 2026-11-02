"""Signal measurements for recorded data. Does not use the physics simulator or priors.

FFT work is O(channels * P * log(P)) with P = ZERO_PAD * samples; the speed search adds
O(grid * SPEED_HARMONICS). Outputs are compact plot previews. Amplitude units are
deliberately left as native source units, not invented g or um.

Shaft speed is estimated from each recording (harmonic-sum search near the nominal speed)
because the documented ~1238 RPM does not match where the harmonics actually are.
"""

import numpy as np

FEATURE_NAMES = ("rms", "crest_factor", "kurtosis", "shaft_1x", "shaft_2x", "shaft_3x")
ZERO_PAD = 8  # interpolates the spectrum to 1/8 Hz for a one-second recording
SPEED_SEARCH = 0.15  # search +/-15% around the nominal shaft frequency
SPEED_STEP_HZ = 0.005
SPEED_HARMONICS = 4
BAND_HZ = 1.0  # half-width of each harmonic band around order * estimated shaft frequency
NORMALISE_BAND_HZ = (5.0, 500.0)


def _padded_spectrum(centered: np.ndarray, sample_rate_hz: float):
    size = centered.shape[1]
    window = np.hanning(size)
    amplitude = 2 * np.abs(np.fft.rfft(centered * window, size * ZERO_PAD, axis=1)) / window.sum()
    return amplitude, np.fft.rfftfreq(size * ZERO_PAD, 1 / sample_rate_hz)


def _check(signal: np.ndarray, sample_rate_hz: float, rpm: float) -> np.ndarray:
    if signal.ndim != 2 or signal.shape[0] != 4 or signal.shape[1] < 64:
        raise ValueError("expected four accelerometer channels with at least 64 samples")
    if not np.isfinite(signal).all() or sample_rate_hz <= 0 or rpm <= 0:
        raise ValueError("recording and acquisition settings must be finite and positive")
    centered = signal - signal.mean(axis=1, keepdims=True)
    if np.any(np.sqrt(np.mean(centered**2, axis=1)) == 0):
        raise ValueError("a channel is flat (dead sensor); its features would be meaningless")
    return centered


def estimate_shaft_hz(signal: np.ndarray, sample_rate_hz: float, nominal_rpm: float) -> float:
    """Shaft frequency whose first four harmonics carry the most energy across channels.

    Each channel's spectrum is divided by its median level so no single sensor dominates.
    """
    centered = _check(signal, sample_rate_hz, nominal_rpm)
    amplitude, frequencies = _padded_spectrum(centered, sample_rate_hz)
    band = (frequencies > NORMALISE_BAND_HZ[0]) & (frequencies < NORMALISE_BAND_HZ[1])
    level = np.median(amplitude[:, band], axis=1, keepdims=True)
    total = (amplitude / np.maximum(level, np.finfo(float).tiny)).sum(axis=0)
    nominal_hz = nominal_rpm / 60
    grid = np.arange(
        nominal_hz * (1 - SPEED_SEARCH), nominal_hz * (1 + SPEED_SEARCH), SPEED_STEP_HZ
    )
    score = sum(np.interp(k * grid, frequencies, total) for k in range(1, SPEED_HARMONICS + 1))
    return float(grid[int(np.argmax(score))])


def analyse_recording(signal: np.ndarray, sample_rate_hz: float, shaft_hz: float) -> list[dict]:
    """Per-channel features and plot previews, with harmonic bands at order * `shaft_hz`."""
    centered = _check(signal, sample_rate_hz, shaft_hz)
    size = centered.shape[1]
    window = np.hanning(size)
    amplitude = 2 * np.abs(np.fft.rfft(centered * window, axis=1)) / window.sum()
    frequencies = np.fft.rfftfreq(size, 1 / sample_rate_hz)
    padded, padded_frequencies = _padded_spectrum(centered, sample_rate_hz)
    channels = []
    for index, data in enumerate(centered):
        rms = float(np.sqrt(np.mean(data**2)))
        features = {
            "rms": rms,
            "crest_factor": float(np.max(np.abs(data)) / rms),
            "kurtosis": float(np.mean(data**4) / rms**4),
        }
        for order in (1, 2, 3):
            band = np.abs(padded_frequencies - order * shaft_hz) <= BAND_HZ
            features[f"shaft_{order}x"] = float(padded[index, band].max())
        preview_indices = np.arange(0, min(size, int(sample_rate_hz * 0.05)), 4)
        spectrum_indices = np.flatnonzero(frequencies <= 1000)
        channels.append(
            {
                "channel": index,
                "features": {k: round(v, 8) for k, v in features.items()},
                "waveform": [
                    {
                        "time_ms": round(i * 1000 / sample_rate_hz, 4),
                        "amplitude": round(float(data[i]), 8),
                    }
                    for i in preview_indices
                ],
                "spectrum": [
                    {
                        "frequency_hz": round(float(frequencies[i]), 4),
                        "amplitude": round(float(amplitude[index, i]), 8),
                    }
                    for i in spectrum_indices
                ],
            }
        )
    return channels


def nearest_reference(reference: list[dict], query: list[dict]) -> dict:
    """Fixed log-feature nearest centroid baseline; no probability interpretation."""

    def vector(channels):
        return np.log(
            np.maximum([c["features"][name] for c in channels for name in FEATURE_NAMES], 1e-12)
        )

    values = np.array([vector(record["channels"]) for record in reference])
    scale = np.maximum(values.std(axis=0), 1e-6)
    query_vector = vector(query)
    labels = sorted({record["label"] for record in reference})
    distances = {}
    for label in labels:
        centroid = values[[r["label"] == label for r in reference]].mean(axis=0)
        distances[label] = round(float(np.mean(((query_vector - centroid) / scale) ** 2)), 6)
    return {"label": min(distances, key=distances.get), "distances": distances}
