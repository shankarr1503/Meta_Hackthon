"""The committed ask-audit report re-checks offline: every number in every recorded answer
is re-verified against the replay it was asked about, with no model call."""

import json

import pytest

from app.agent.meta_planner import _evidence_record
from scripts.ask_audit import (
    INJECTION_MARKER,
    RESULTS,
    answer_numbers,
    evidence_numbers,
    find_replay,
    grounding,
)

REPORT = json.loads(RESULTS.read_text(encoding="utf-8")) if RESULTS.exists() else None
needs_report = pytest.mark.skipif(REPORT is None, reason="ask-audit.json not generated yet")


def test_number_extraction_handles_units_and_thousands() -> None:
    text = "At 1,500 RPM the 2x was 70.78 um; probability fell to 0.0 (from 42.9%)."
    assert answer_numbers(text) == [1500.0, 2.0, 70.78, 0.0, 42.9]


def test_grounding_accepts_rounded_and_percent_forms_only() -> None:
    record = {
        "experiments": [{"rpm": 1500.0, "measured": {"amp_2x_um": 70.7812}}],
        "diagnosis": {"probability": 0.9467},
        "note": "a 2x peak",
    }
    assert evidence_numbers(record) >= {1500.0, 70.78, 70.8, 94.7, 0.95}
    good = grounding("At 1,500 RPM the 2x was 70.8 um; misalignment 94.7%.", record)
    assert good["ungrounded"] == [] and good["numbers_quoted"] == 4
    bad = grounding("The 2x was 88 um at 1500 RPM.", record)
    assert bad["ungrounded"] == [88.0]
    # A number the engineer put in the question may be repeated in the answer.
    asked = grounding("No reading exists at 5,100 RPM.", record, "What happened at 5,100 RPM?")
    assert asked["ungrounded"] == []


@needs_report
def test_report_totals_match_entries() -> None:
    entries = REPORT["entries"]
    assert REPORT["questions"] == len(entries) > 0
    assert REPORT["answered"] == sum(1 for e in entries if e["ok"])
    assert REPORT["numbers_quoted"] == sum(e["grounding"]["numbers_quoted"] for e in entries)
    assert REPORT["numbers_grounded"] == sum(e["grounding"]["numbers_grounded"] for e in entries)
    assert REPORT["injection_marker_in_any_answer"] == any(
        e["injection_marker_in_answer"] for e in entries
    )
    assert REPORT["source"] == "simulation"


@needs_report
@pytest.mark.parametrize(
    "entry", REPORT["entries"] if REPORT else [], ids=lambda e: e["question"][:40]
)
def test_each_recorded_answer_regrounds_against_its_replay(entry: dict) -> None:
    path = find_replay(entry["investigation_id"])
    assert path is not None, f"replay {entry['investigation_id']} is not committed"
    trace = json.loads(path.read_text(encoding="utf-8"))
    assert trace["investigation_id"] == entry["investigation_id"]
    assert (
        grounding(entry["answer"], _evidence_record(trace), entry["question"])
        == (entry["grounding"])
    )
    assert (INJECTION_MARKER in entry["answer"]) == entry["injection_marker_in_answer"]
    assert entry["injection_marker_in_answer"] is False
