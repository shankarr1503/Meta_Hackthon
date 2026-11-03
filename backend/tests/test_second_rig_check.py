"""The committed second-rig report reproduces from its own stored features."""

import json
from pathlib import Path

from scripts.second_rig_check import (
    CONDITIONS,
    RECORDINGS_PER_CONDITION,
    REFERENCE_COUNT,
    classify,
)

REPORT = Path(__file__).resolve().parents[1] / "results" / "second-rig-check.json"


def load_report() -> dict:
    return json.loads(REPORT.read_text(encoding="utf-8"))


def test_report_structure() -> None:
    report = load_report()
    assert report["source"]["license"] == "CC BY 4.0"
    assert report["source"]["doi"] == "10.5281/zenodo.10846291"
    assert set(report["recordings"]) == set(CONDITIONS)
    for rows in report["recordings"].values():
        assert len(rows) == RECORDINGS_PER_CONDITION
        for row in rows:
            assert len(row["features"]) == 24
            assert len(row["sha256"]) == 64
            assert 25.5 <= row["shaft_hz"] <= 34.5


def test_predictions_reproduce_from_stored_features() -> None:
    report = load_report()
    references = {
        condition: [row["features"] for row in rows[:REFERENCE_COUNT]]
        for condition, rows in report["recordings"].items()
    }
    held_out = [
        (condition, row)
        for condition, rows in report["recordings"].items()
        for row in rows[REFERENCE_COUNT:]
    ]
    predictions = classify(references, [row["features"] for _, row in held_out])
    stored = report["held_out_results"]
    assert len(stored) == len(held_out)
    for (condition, row), prediction, result in zip(held_out, predictions, stored, strict=True):
        assert result["file"] == row["file"]
        assert result["true"] == condition
        assert result["predicted"] == prediction
    correct = sum(r["true"] == r["predicted"] for r in stored)
    assert report["accuracy"] == f"{correct}/{len(stored)}"
