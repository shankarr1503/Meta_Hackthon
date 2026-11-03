"""Real-data path: signal math, label isolation, source checks and recorded assessment."""

import hashlib
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.measured import analyse_recording, estimate_shaft_hz, nearest_reference
from app.schemas.real_recordings import RealRecordingsResponse
from scripts.real_examples import DATA, LABELS, NOMINAL_RPM, SAMPLE_RATE_HZ, assess


def test_measured_features_have_known_fft_amplitude_and_rms() -> None:
    time = np.arange(25000) / 25000
    signal = np.tile(2 * np.sin(2 * np.pi * 20 * time), (4, 1))
    channels = analyse_recording(signal, 25000, 20.0)
    assert channels[0]["features"]["rms"] == pytest.approx(2**0.5)
    assert channels[0]["features"]["shaft_1x"] == pytest.approx(2, rel=0.001)
    assert channels[0]["features"]["kurtosis"] == pytest.approx(1.5)
    assert channels[0]["waveform"][-1]["time_ms"] < 50
    assert channels[0]["spectrum"][-1]["frequency_hz"] == 1000
    with pytest.raises(ValueError):
        analyse_recording(np.ones((1, 25000)), 25000, 20.6)
    with pytest.raises(ValueError):
        analyse_recording(np.full((4, 25000), np.nan), 25000, 20.6)
    dead = np.tile(2 * np.sin(2 * np.pi * 20 * time), (4, 1))
    dead[3] = 0.5
    with pytest.raises(ValueError, match="flat"):
        analyse_recording(dead, 25000, 20.0)


def test_shaft_speed_is_estimated_from_the_harmonics_not_the_nominal_value() -> None:
    time = np.arange(25000) / 25000
    true_hz = 21.43  # about 1286 RPM, as in the recordings; the nominal 1238 RPM is 20.63 Hz
    rng = np.random.default_rng(4)
    harmonics = sum(
        a * np.sin(2 * np.pi * k * true_hz * time + k) for k, a in ((1, 1.0), (2, 0.6), (3, 0.4))
    )
    signal = harmonics + rng.normal(0, 0.3, (4, time.size))
    estimate = estimate_shaft_hz(signal, 25000, NOMINAL_RPM)
    assert estimate == pytest.approx(true_hz, abs=0.02)
    channels = analyse_recording(signal, 25000, estimate)
    # The 3x band now sits on the 3x peak (0.4), not on the floor between harmonics.
    assert channels[0]["features"]["shaft_3x"] == pytest.approx(0.4, rel=0.1)
    wrong = analyse_recording(signal, 25000, NOMINAL_RPM / 60)
    assert wrong[0]["features"]["shaft_3x"] < 0.2


def test_meta_only_sees_reference_labels_and_requested_query_channels() -> None:
    class Fake:
        def __init__(self):
            self.prompts = []

        def complete(self, system, user):
            self.prompts.append(json.loads(user))
            if len(self.prompts) == 1:
                return '{"action":"inspect","channel":2,"reason":"Compare bearing locations."}'
            return '{"action":"diagnose","label":"unbalance","reason":"Reference comparison."}'

    channels = [{"channel": i, "features": {"rms": 1.0 + i}} for i in range(4)]
    reference = [{"label": label, "channels": channels} for label in LABELS]
    client = Fake()
    result = assess(client, reference, channels)
    assert result["observed_channels"] == [0, 2]
    assert result["label"] == "unbalance"
    assert [c["channel"] for c in client.prompts[0]["query_channels"]] == [0]
    assert [c["channel"] for c in client.prompts[1]["query_channels"]] == [0, 2]
    assert "label" not in client.prompts[0]
    assert "filename" not in client.prompts[0]


def test_invalid_sensor_selection_is_reported_without_a_hidden_fallback() -> None:
    class Fake:
        def complete(self, system, user):
            return '{"action":"inspect","channel":0,"reason":"Repeat."}'

    result = assess(Fake(), [], [{"channel": i, "features": {}} for i in range(4)])
    assert result["status"] == "model_error"
    assert result["label"] == "unknown"
    assert result["events"][-1]["action"] == "error"


def _minimal_report(**overrides) -> dict:
    """A structurally valid real-recordings report with no records."""
    report = {
        "source": "measured_laboratory",
        "study_version": "real-2",
        "dataset": {
            "source": "measured_laboratory",
            "dataset_url": "https://example.test/dataset",
            "doi": "10.example/test",
            "license": "CC BY 4.0",
            "license_url": "https://example.test/license",
            "attribution": "Test Authors (2026)",
            "selection": "Test selection.",
            "recordings": [],
        },
        "sample_rate_hz": 25000,
        "duration_s": 1,
        "shaft_rpm_approximate": 1280,
        "shaft_rpm_documented": 1238,
        "shaft_rpm_estimated_range": [1260.0, 1300.0],
        "amplitude_units": "native source units (physical unit not verified)",
        "plan_sha256": "0" * 64,
        "reference_trials": 0,
        "held_out_trials": 0,
        "model": None,
        "baseline_correct": 0,
        "meta_correct": None,
        "meta_accuracy_ci95": None,
        "model_errors": 0,
        "records": [],
        "superseded_study": {
            "version": "real-1",
            "status": "superseded",
            "plan_sha256": "0" * 64,
            "model": "test-model",
            "reason": "Test reason.",
            "baseline_correct": 0,
            "meta_correct": None,
            "meta_accuracy_ci95": None,
            "held_out_trials": 0,
            "records": [],
        },
        "limitations": ["Test limitation."],
    }
    report.update(overrides)
    return report


def test_real_api_never_relabels_simulation_as_real(make_settings) -> None:
    settings = make_settings()
    client = TestClient(create_app(settings))
    assert client.get("/api/real-recordings").status_code == 404
    settings.results_dir.mkdir(parents=True)
    path = settings.results_dir / "real-recordings.json"
    path.write_text('{"source":"simulation"}')
    assert client.get("/api/real-recordings").status_code == 503
    path.write_text(json.dumps(_minimal_report()))
    assert client.get("/api/real-recordings").json()["source"] == "measured_laboratory"


def test_real_api_rejects_malformed_evidence_shape(make_settings) -> None:
    settings = make_settings()
    client = TestClient(create_app(settings))
    settings.results_dir.mkdir(parents=True)
    path = settings.results_dir / "real-recordings.json"
    malformed = [
        json.dumps({k: v for k, v in _minimal_report().items() if k != "records"}),
        json.dumps(_minimal_report(records={})),
        json.dumps(_minimal_report(records=[{"split": "test"}])),
        json.dumps(_minimal_report(meta_accuracy_ci95=[0.1])),
        json.dumps(_minimal_report(dataset={"doi": "10.example/test"})),
        json.dumps(_minimal_report(truth="normal")),
        json.dumps(["measured_laboratory"]),
    ]
    for payload in malformed:
        path.write_text(payload)
        assert client.get("/api/real-recordings").status_code == 503, payload


def test_committed_real_report_matches_response_schema() -> None:
    path = DATA.parents[1] / "results" / "real-recordings.json"
    if not path.exists():
        pytest.skip("real dataset not yet prepared")
    report = json.loads(path.read_text(encoding="utf-8"))
    RealRecordingsResponse.model_validate(report)


def test_published_real_split_and_scores_are_trial_disjoint() -> None:
    path = DATA.parents[1] / "results" / "real-recordings.json"
    if not path.exists():
        pytest.skip("real dataset not yet prepared")
    report = json.loads(path.read_text(encoding="utf-8"))
    reference = [r for r in report["records"] if r["split"] == "reference"]
    held_out = [r for r in report["records"] if r["split"] == "held_out"]
    assert len(reference) == 12 and len(held_out) == 8
    for record in report["records"]:
        raw = DATA / "raw" / f"test-{record['provenance']['test']:02d}.npy"
        if raw.exists():
            assert (
                hashlib.sha256(raw.read_bytes()).hexdigest()
                == record["provenance"]["recording_sha256"]
            )
            signal = np.load(raw, allow_pickle=False)
            shaft_hz = estimate_shaft_hz(signal, SAMPLE_RATE_HZ, NOMINAL_RPM)
            assert round(shaft_hz * 60, 1) == record["shaft_rpm_estimated"]
            assert analyse_recording(signal, SAMPLE_RATE_HZ, shaft_hz) == record["channels"]
    assert {r["provenance"]["test"] for r in reference}.isdisjoint(
        {r["provenance"]["test"] for r in held_out}
    )
    assert report["baseline_correct"] == sum(r["baseline"]["label"] == r["label"] for r in held_out)
    if report["meta_correct"] is not None:
        assert report["meta_correct"] == sum(r["meta"]["label"] == r["label"] for r in held_out)
        for record in held_out:

            class RecordedClient:
                def __init__(self, events):
                    self.replies = iter(event["raw_response"] for event in events)

                def complete(self, system, user):
                    return next(self.replies)

            assert nearest_reference(reference, record["channels"]) == record["baseline"]
            again = assess(RecordedClient(record["meta"]["events"]), reference, record["channels"])
            assert again == record["meta"]
