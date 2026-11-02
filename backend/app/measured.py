"""Signal measurements for recorded data. Does not use the physics simulator or priors.

FFT work is O(channels * samples * log(samples)); outputs are compact plot previews.
Amplitude units are deliberately left as native source units, not invented g or um.
"""

import numpy as np

FEATURE_NAMES = ("rms", "crest_factor", "kurtosis", "shaft_1x", "shaft_2x", "shaft_3x")


def analyse_recording(signal: np.ndarray, sample_rate_hz: float, shaft_rpm: float) -> list[dict]:
    if signal.ndim != 2 or signal.shape[0] != 4 or signal.shape[1] < 64:
        raise ValueError("expected four accelerometer channels with at least 64 samples")
    if not np.isfinite(signal).all() or sample_rate_hz <= 0 or shaft_rpm <= 0:
        raise ValueError("recording and acquisition settings must be finite and positive")
    size = signal.shape[1]
    centered = signal - signal.mean(axis=1, keepdims=True)
    window = np.hanning(size)
    amplitude = 2 * np.abs(np.fft.rfft(centered * window, axis=1)) / window.sum()
    frequencies = np.fft.rfftfreq(size, 1 / sample_rate_hz)
    channels = []
    for index, data in enumerate(centered):
        rms = float(np.sqrt(np.mean(data**2)))
        features = {
            "rms": rms,
            "crest_factor": float(np.max(np.abs(data)) / rms) if rms else 0,
            "kurtosis": float(np.mean(data**4) / rms**4) if rms else 0,
        }
        for order in (1, 2, 3):
            band = np.abs(frequencies - order * shaft_rpm / 60) <= 1.5
            features[f"shaft_{order}x"] = float(amplitude[index, band].max()) if band.any() else 0
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
