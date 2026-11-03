"""Exploratory second-rig robustness check on public CC BY 4.0 recordings.

Downloads 40 accelerometer recordings (four conditions, 30 Hz shaft) from
"Vibration data of rotating machines subjected to different failure conditions"
(Marra & Marte, 2024, Zenodo, DOI 10.5281/zenodo.10846291, CC BY 4.0), mirrored
file-by-file at a pinned commit of the authors' repository. It computes the same
feature family as the measured-data path (per-channel RMS, crest factor,
kurtosis and 1x/2x/3x shaft harmonics), splits each condition into five
reference and five held-out recordings, classifies held-out recordings by
nearest class centroid on standardized log features, and writes
``backend/results/second-rig-check.json`` for the tests to re-check.

This is an exploratory check, not a pre-registered study: the 50 recordings per
condition are consecutive segments of one session, so held-out segments are
correlated with the references. No Meta model call is made and no simulator
quantity is used. FFT work is O(n log n) per channel; everything else is linear.

Run from ``backend/``:  ``python scripts/second_rig_check.py``
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND / "data" / "real" / "second_rig"
RESULT_PATH = BACKEND / "results" / "second-rig-check.json"

SOURCE_DOI = "10.5281/zenodo.10846291"
SOURCE_LICENSE = "CC BY 4.0"
MIRROR_REPO = "JordanComputac/Analise-de-falhas-de-maquinas-rotativas"
MIRROR_COMMIT = "7b5153a2a5db42746859df6ee5e82506140e780b"
RAW_BASE = f"https://raw.githubusercontent.com/{MIRROR_REPO}/{MIRROR_COMMIT}/Dados_Real"

# Condition name -> (source directory, file prefix). Shaft speed 30 Hz nominal.
CONDITIONS: dict[str, tuple[str, str]] = {
    "normal": ("Baseline", "Normal"),
    "unbalance": ("Desbalanc1LA", "Desbalanc1"),
    "misalignment": ("DesalinhHorizLOA", "DesalinhHoriz"),
    "bearing_defect": ("Defeito Rolamento", "Rolam"),
}
RECORDINGS_PER_CONDITION = 10
REFERENCE_COUNT = 5
ACCEL_COLS = (3, 4, 5, 6)  # Accel Coupled H/V, Accel Uncoupled H/V
NOMINAL_SHAFT_HZ = 30.0
SPEED_TOLERANCE = 0.15
FEATURE_NAMES = ("rms", "crest", "kurtosis", "shaft_1x", "shaft_2x", "shaft_3x")


def download(condition: str) -> list[Path]:
    """Fetch this condition's recordings into the Git-ignored data directory."""
    source_dir, prefix = CONDITIONS[condition]
    target = DATA_DIR / condition
    target.mkdir(parents=True, exist_ok=True)
    paths = []
    for i in range(1, RECORDINGS_PER_CONDITION + 1):
        name = f"{prefix}_30Hz_{i:03d}.lvm"
        path = target / name
        if not path.exists():
            url = f"{RAW_BASE}/{quote(source_dir)}/30Hz/{name}"
            print(f"downloading {condition}/{name}")
            with urlopen(url, timeout=60) as response:
                path.write_bytes(response.read())
        paths.append(path)
    return paths


def load_lvm(path: Path) -> tuple[np.ndarray, float]:
    """Accelerometer samples (n, 4) and the sample rate from one LabVIEW .lvm file."""
    lines = path.read_text(encoding="latin-1").splitlines()
    header_ends = [i for i, line in enumerate(lines) if line.startswith("***End_of_Header***")]
    rows = []
    for line in lines[header_ends[1] + 2 :]:
        parts = line.split("\t")
        if len(parts) <= max(ACCEL_COLS):
            continue
        try:
            rows.append([float(parts[c]) for c in (1, *ACCEL_COLS)])
        except ValueError:
            continue
    data = np.array(rows)
    dt = float(np.median(np.diff(data[:200, 0])))
    return data[:, 1:], 1.0 / dt


def estimate_shaft_hz(signals: np.ndarray, rate_hz: float) -> float:
    """Frequency within ±15% of nominal whose first four harmonics carry the most energy."""
    n = signals.shape[0]
    window = np.hanning(n)
    centred = signals - signals.mean(axis=0)
    spectrum = sum(
        np.abs(np.fft.rfft(centred[:, ch] * window))
        / (np.median(np.abs(np.fft.rfft(centred[:, ch] * window))) + 1e-12)
        for ch in range(signals.shape[1])
    )
    freqs = np.fft.rfftfreq(n, d=1.0 / rate_hz)
    low = NOMINAL_SHAFT_HZ * (1 - SPEED_TOLERANCE)
    high = NOMINAL_SHAFT_HZ * (1 + SPEED_TOLERANCE)
    step = max(1, int(0.1 / (freqs[1] - freqs[0])))
    candidates = freqs[(freqs >= low) & (freqs <= high)][::step]

    def harmonic_energy(f0: float) -> float:
        total = 0.0
        for k in (1, 2, 3, 4):
            band = (freqs >= k * f0 - 1.0) & (freqs <= k * f0 + 1.0)
            if band.any():
                total += float(spectrum[band].max())
        return total

    return float(max(candidates, key=harmonic_energy))


def feature_vector(signals: np.ndarray, rate_hz: float, shaft_hz: float) -> list[float]:
    """Per-channel RMS, crest, kurtosis and 1x/2x/3x amplitudes, flattened."""
    n = signals.shape[0]
    window = np.hanning(n)
    freqs = np.fft.rfftfreq(n, d=1.0 / rate_hz)
    out: list[float] = []
    for ch in range(signals.shape[1]):
        x = signals[:, ch] - signals[:, ch].mean()
        rms = float(np.sqrt(np.mean(x**2)))
        crest = float(np.max(np.abs(x)) / (rms + 1e-12))
        kurtosis = float(np.mean(x**4) / (np.mean(x**2) ** 2 + 1e-12))
        amplitude = np.abs(np.fft.rfft(x * window)) * 2.0 / np.sum(window)
        harmonics = []
        for k in (1, 2, 3):
            band = (freqs >= k * shaft_hz - 1.0) & (freqs <= k * shaft_hz + 1.0)
            harmonics.append(float(amplitude[band].max()) if band.any() else 0.0)
        out.extend([rms, crest, kurtosis, *harmonics])
    return out


def classify(references: dict[str, list[list[float]]], queries: list[list[float]]) -> list[str]:
    """Nearest class centroid on standardized log features. Pure; re-checked by tests."""
    stacked = np.log(np.abs(np.array([v for rows in references.values() for v in rows])) + 1e-9)
    mu, sigma = stacked.mean(axis=0), stacked.std(axis=0) + 1e-9

    def standardize(vector: list[float]) -> np.ndarray:
        return (np.log(np.abs(np.array(vector)) + 1e-9) - mu) / sigma

    centroids = {
        name: np.mean([standardize(v) for v in rows], axis=0) for name, rows in references.items()
    }
    return [
        min(centroids, key=lambda name: float(np.linalg.norm(standardize(q) - centroids[name])))
        for q in queries
    ]


def main() -> int:
    recordings: dict[str, list[dict[str, object]]] = {}
    for condition in CONDITIONS:
        for path in download(condition):
            signals, rate_hz = load_lvm(path)
            shaft_hz = estimate_shaft_hz(signals, rate_hz)
            recordings.setdefault(condition, []).append(
                {
                    "file": path.name,
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "shaft_hz": round(shaft_hz, 2),
                    "features": [round(v, 6) for v in feature_vector(signals, rate_hz, shaft_hz)],
                }
            )

    references = {
        c: [r["features"] for r in rows[:REFERENCE_COUNT]] for c, rows in recordings.items()
    }
    held_out = [(c, r) for c, rows in recordings.items() for r in rows[REFERENCE_COUNT:]]
    predictions = classify(references, [r["features"] for _, r in held_out])

    results = [
        {"file": r["file"], "true": c, "predicted": p}
        for (c, r), p in zip(held_out, predictions, strict=True)
    ]
    correct = sum(row["true"] == row["predicted"] for row in results)
    report = {
        "source": {
            "doi": SOURCE_DOI,
            "license": SOURCE_LICENSE,
            "mirror_repo": MIRROR_REPO,
            "mirror_commit": MIRROR_COMMIT,
        },
        "protocol": {
            "note": (
                "Exploratory robustness check, not a pre-registered study. Recordings per "
                "condition are consecutive segments of one session, so held-out segments "
                "are correlated with references. No Meta model call; no simulator quantity."
            ),
            "feature_names": [f"ch{c}_{f}" for c in range(1, 5) for f in FEATURE_NAMES],
            "references_per_condition": REFERENCE_COUNT,
            "held_out_per_condition": RECORDINGS_PER_CONDITION - REFERENCE_COUNT,
        },
        "recordings": recordings,
        "held_out_results": results,
        "accuracy": f"{correct}/{len(results)}",
    }
    RESULT_PATH.write_text(json.dumps(report, indent=1), encoding="utf-8")
    for row in results:
        mark = "OK" if row["true"] == row["predicted"] else "WRONG"
        print(f"{row['file']:<30} true={row['true']:<16} predicted={row['predicted']:<16} {mark}")
    print(f"accuracy {correct}/{len(results)}; report written to {RESULT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
