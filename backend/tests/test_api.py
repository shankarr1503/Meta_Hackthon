"""API: closed schemas, error paths, public fields only, replays and readiness."""

import json
import re

import pytest
from fastapi.testclient import TestClient

from app.cases import SEALED_CASES
from app.main import create_app

PUBLIC_CASE_FIELDS = {"case_id", "title", "note", "initial_rpm", "initial_load_n"}


def test_cases_return_exactly_public_fields(client: TestClient) -> None:
    cases = client.get("/api/cases").json()
    assert [c["case_id"] for c in cases] == [s.case_id for s in SEALED_CASES]
    for case in cases:
        assert set(case) == PUBLIC_CASE_FIELDS
        assert case["initial_rpm"] == 2950
        assert case["initial_load_n"] == 500


def test_experiment_returns_simulated_features(client: TestClient) -> None:
    body = client.post("/api/experiments", json={"case_id": "case-k7", "rpm": 3000}).json()
    assert body["source"] == "simulation"
    assert body["kind"] == "case"
    assert body["amp_1x_um"] > 0
    assert len(body["displacement_um"]) == len(body["time_s"]) <= 400
    assert max(body["spectrum_freq_hz"]) <= 200
    assert len(body["spectrum_freq_hz"]) == len(body["spectrum_amp_um"])


def test_experiment_is_seeded(client: TestClient) -> None:
    request = {"case_id": "case-r2", "rpm": 1800, "load_n": 1000, "seed": 9}
    assert client.post("/api/experiments", json=request).json() == (
        client.post("/api/experiments", json=request).json()
    )


@pytest.mark.parametrize("case", SEALED_CASES, ids=lambda c: c.case_id)
def test_experiment_never_returns_hidden_values(client: TestClient, case) -> None:
    text = client.post("/api/experiments", json={"case_id": case.case_id, "rpm": 2000}).text
    for key in ("wn_rpm", "thermal", "faults", "truth", "imbalance", "friction", "misalign"):
        assert key not in text


@pytest.mark.parametrize(
    "body",
    [
        {"case_id": "case-k7", "rpm": 3000, "truth": "imbalance"},
        {"case_id": "case-k7", "rpm": 7000},
        {"case_id": "case-k7", "rpm": -1},
        {"case_id": "case-k7", "rpm": 1000, "load_n": 6000},
        {"case_id": "", "rpm": 1000},
        {"case_id": "case-k7", "rpm": 1000, "sample_rate_hz": 100},
        {"case_id": "case-k7", "rpm": 1000, "duration_s": 0.001},
        {"rpm": 1000},
    ],
)
def test_experiment_rejects_bad_requests(client: TestClient, body: dict) -> None:
    assert client.post("/api/experiments", json=body).status_code == 422


def test_experiment_unknown_case(client: TestClient) -> None:
    response = client.post("/api/experiments", json={"case_id": "case-zz", "rpm": 1000})
    assert response.status_code == 404


def test_lab_simulates_preset_machine(client: TestClient) -> None:
    body = client.post(
        "/api/lab/simulate", json={"imbalance": 0.5, "rpm": 3000, "load_n": 500, "seed": 1}
    ).json()
    assert body["kind"] == "lab"
    assert body["source"] == "simulation"
    assert len(body["curve_rpm"]) == len(body["curve_amp_1x_um"]) == 61
    peak_rpm = body["curve_rpm"][body["curve_amp_1x_um"].index(max(body["curve_amp_1x_um"]))]
    assert 3400 <= peak_rpm <= 3800  # preset critical speed 3,600 RPM


@pytest.mark.parametrize(
    "body",
    [
        {"rpm": 1000, "case_id": "case-k7"},
        {"rpm": 1000, "imbalance": 2},
        {"rpm": 1000, "wn_rpm": 3000},
        {"imbalance": 0.5},
    ],
)
def test_lab_rejects_bad_requests(client: TestClient, body: dict) -> None:
    assert client.post("/api/lab/simulate", json=body).status_code == 422


def test_rule_investigation_round_trip(client: TestClient) -> None:
    request = {"case_id": "case-m9", "planner": "info_gain", "seed": 2}
    trace = client.post("/api/investigations", json=request).json()
    assert trace["investigation_id"] == "case-m9-info_gain-2"
    assert trace["source"] == "simulation"
    assert client.get("/api/investigations/case-m9-info_gain-2").json() == trace
    listed = client.get("/api/investigations").json()
    assert [s["investigation_id"] for s in listed] == ["case-m9-info_gain-2"]
    assert listed[0]["top"] == trace["diagnosis"]["top"]
    assert listed[0]["demo"] is False


def test_investigation_trace_has_no_hidden_values(client: TestClient) -> None:
    request = {"case_id": "case-b6", "planner": "sweep", "seed": 0}
    text = client.post("/api/investigations", json=request).text
    assert '"wn_rpm"' not in text and '"thermal"' not in text and '"faults"' not in text


@pytest.mark.parametrize(
    "body",
    [
        {"case_id": "case-k7", "planner": "oracle"},
        {"case_id": "case-k7", "planner": "sweep", "seed": 10_001},
        {"case_id": "case-k7", "planner": "sweep", "truth": "imbalance"},
    ],
)
def test_investigation_rejects_bad_requests(client: TestClient, body: dict) -> None:
    assert client.post("/api/investigations", json=body).status_code == 422


def test_investigation_unknown_case(client: TestClient) -> None:
    response = client.post("/api/investigations", json={"case_id": "nope", "planner": "sweep"})
    assert response.status_code == 404


def test_meta_without_model_returns_clear_503(client: TestClient) -> None:
    response = client.post("/api/investigations", json={"case_id": "case-k7"})
    assert response.status_code == 503
    assert "FAILURELAB_LLM_API_KEY" in response.json()["detail"]
    assert "info_gain" in response.json()["detail"]


@pytest.mark.parametrize("bad_id", ["..%2F..%2Fsecrets", "UPPER", "a" * 81, "x.json", "a b"])
def test_replay_ids_are_validated(client: TestClient, bad_id: str) -> None:
    assert client.get(f"/api/investigations/{bad_id}").status_code in {400, 404}


def test_replay_bad_id_is_400(client: TestClient) -> None:
    assert client.get("/api/investigations/Bad.Id").status_code == 400


def test_missing_replay_is_404(client: TestClient) -> None:
    assert client.get("/api/investigations/case-k7-sweep-99").status_code == 404


def test_demo_replays_are_listed_and_loadable(make_settings, tmp_path) -> None:
    settings = make_settings()
    client = TestClient(create_app(settings))
    trace = client.post("/api/investigations", json={"case_id": "case-x1", "planner": "sweep"})
    demo = settings.replays_dir / "demo"
    demo.mkdir()
    moved = trace.json() | {"investigation_id": "case-x1-sweep-77"}
    (demo / "case-x1-sweep-77.json").write_text(json.dumps(moved), encoding="utf-8")
    listed = {s["investigation_id"]: s["demo"] for s in client.get("/api/investigations").json()}
    assert listed == {"case-x1-sweep-77": True, "case-x1-sweep-0": False}
    assert client.get("/api/investigations/case-x1-sweep-77").status_code == 200


def test_ready_reports_model_status_without_secrets(make_settings) -> None:
    client = TestClient(
        create_app(
            make_settings(
                llm_api_key="sk-secret-value",
                llm_model="test-model",
                llm_base_url="https://example.invalid/v1",
            )
        )
    )
    response = client.get("/api/ready")
    body = response.json()
    assert body["meta_model_configured"] is True
    assert body["meta_model"] == "test-model"
    assert "sk-secret-value" not in response.text
    assert "example.invalid" not in response.text


def test_ready_without_model(client: TestClient) -> None:
    body = client.get("/api/ready").json()
    assert body == {
        "status": "ok",
        "physics_model_version": "rotor-1",
        "meta_model_configured": False,
        "meta_model": "",
    }


def _configured_client(make_settings, monkeypatch, complete) -> TestClient:
    from app.agent.llm_client import ChatCompletionsClient

    monkeypatch.setattr(ChatCompletionsClient, "complete", complete)
    settings = make_settings(
        llm_api_key="k", llm_model="m", llm_base_url="https://example.invalid/v1"
    )
    return TestClient(create_app(settings))


def test_meta_investigation_with_working_model(make_settings, monkeypatch) -> None:
    from tests.test_meta_planner import smart_reply

    client = _configured_client(make_settings, monkeypatch, lambda self, s, u: smart_reply(u))
    trace = client.post("/api/investigations", json={"case_id": "case-k7", "seed": 1}).json()
    assert re.fullmatch(r"case-k7-meta-1-\d{14}", trace["investigation_id"])
    assert trace["planner"] == "meta"
    assert all(event["ok"] for event in trace["llm_events"])
    assert client.get(f"/api/investigations/{trace['investigation_id']}").json() == trace


def test_meta_investigation_falls_back_when_model_fails(make_settings, monkeypatch) -> None:
    from app.agent.llm_client import LLMError

    def fail(self, system: str, user: str) -> str:
        raise LLMError("model request timed out")

    client = _configured_client(make_settings, monkeypatch, fail)
    response = client.post("/api/investigations", json={"case_id": "case-m9"})
    assert response.status_code == 200
    trace = response.json()
    assert all(event["fallback"] for event in trace["llm_events"])
    assert {step["chosen_by"] for step in trace["steps"]} == {"info_gain_fallback"}
    assert trace["diagnosis"]["top"] == "friction"


def test_saved_run_shadows_demo_with_same_id(make_settings) -> None:
    settings = make_settings()
    client = TestClient(create_app(settings))
    trace = client.post("/api/investigations", json={"case_id": "case-k7", "planner": "sweep"})
    demo = settings.replays_dir / "demo"
    demo.mkdir()
    (demo / "case-k7-sweep-0.json").write_text(trace.text, encoding="utf-8")
    listed = client.get("/api/investigations").json()
    assert [(s["investigation_id"], s["demo"]) for s in listed] == [("case-k7-sweep-0", False)]
