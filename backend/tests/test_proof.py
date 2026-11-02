"""Paired challenge integrity, uncertainty estimates and resume behaviour."""

import json
from collections import Counter
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.runner import make_runner
from scripts import proof
from tests.test_meta_planner import smart_reply


def test_challenge_is_balanced_paired_and_not_the_old_sample() -> None:
    runs = proof.challenge_cases()
    assert len(runs) == 72
    assert Counter(s.truth for c, s, _ in runs if c == "no_history") == dict.fromkeys(
        proof.TRUTH_LABELS, 4
    )
    for i in range(0, len(runs), 3):
        batch = runs[i : i + 3]
        assert len({s.case_id for _, s, _ in batch}) == 1
        assert len({s.machine for _, s, _ in batch}) == 1
        readings = [make_runner(s, seed)(2950, 500, 0).features for _, s, seed in batch]
        assert readings[0] == readings[1] == readings[2]
        assert all(s.title == "Challenge machine" for _, s, _ in batch)
        assert all("rand-" not in s.case_id for _, s, _ in batch)
    assert runs == proof.challenge_cases()


def test_uncertainty_does_not_treat_perfect_small_sample_as_certainty() -> None:
    assert proof.wilson(24, 24) == [0.862, 1.0]
    assert proof.wilson(0, 24)[0] == 0
    assert proof.wilson(0, 0) == [0, 1]


def test_paired_difference_and_model_failures_are_counted() -> None:
    outcome = {
        "probability": 0.95,
        "correct": True,
        "cost": 2,
        "calls": 3,
        "fallbacks": 1,
        "latency_s": 4,
        "injection_marker": False,
    }
    rows = [
        {
            "condition": "misleading",
            "meta": outcome,
            "info_gain": {**outcome, "cost": 3, "calls": 0, "fallbacks": 0},
        }
    ] * 4
    result = proof.aggregate(rows)["misleading"]
    assert result["paired_cost_saved"] == 1
    assert result["paired_cost_saved_ci95"] == [1, 1]
    assert result["meta"]["fallbacks"] == 4
    assert result["meta"]["calls"] == 12


def test_proof_records_all_runs_and_resumes_without_model_calls(
    tmp_path: Path, monkeypatch
) -> None:
    class FakeChat:
        model = "fake"
        last_usage = None

        def complete(self, system, user):
            return smart_reply(user)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    class Config:
        llm_configured = True
        llm_model = "fake"
        llm_reasoning_effort = "low"

    monkeypatch.setattr(proof, "get_settings", lambda: Config())
    monkeypatch.setattr(proof.ChatCompletionsClient, "from_settings", lambda _: FakeChat())
    result = proof.run_proof(tmp_path, 1, 200)
    assert result["paired_runs"] == 18
    assert result["machines"] == 6
    report = json.loads((tmp_path / "proof.json").read_text())
    assert len(report["evidence"]) == 18
    assert "signals" not in report["evidence"][0]["traces"]["meta"]["steps"][0]
    resumed = proof.run_proof(tmp_path, 1, 200)
    assert resumed["new_api_calls_this_invocation"] == 0
    assert resumed["new_api_calls"] == result["new_api_calls"]
    assert proof.verify_evidence(tmp_path) == 18
    # Verify the shareable compact report alone, as an external reviewer would.
    for checkpoint in (tmp_path / "proof-traces").glob("*.json"):
        checkpoint.unlink()
    assert proof.verify_evidence(tmp_path) == 18
    capped = tmp_path / "capped"
    with pytest.raises(SystemExit, match="call cap reached"):
        proof.run_proof(capped, 1, 1)
    assert not (capped / "proof.json").exists()
    with pytest.raises(SystemExit, match="plan differs"):
        proof.run_proof(tmp_path, 2, 200)


def test_proof_download_is_fixed_path_and_missing_is_clear(make_settings) -> None:
    settings = make_settings()
    client = TestClient(create_app(settings))
    assert client.get("/api/proof/download").status_code == 404
    settings.results_dir.mkdir(parents=True)
    (settings.results_dir / "proof.json").write_text('{"source":"simulation"}')
    response = client.get("/api/proof/download")
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    assert response.json() == {"source": "simulation"}


def test_published_proof_reproduces_offline() -> None:
    results = Path(__file__).resolve().parents[1] / "results"
    if not (results / "proof.json").exists():
        pytest.skip("live challenge not yet recorded")
    assert proof.verify_evidence(results) == 72
