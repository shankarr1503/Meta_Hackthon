"""Video vibrometry: known synthetic motion must be recovered exactly."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.agent.llm_client import LLMError
from app.config import Settings
from app.main import create_app

UNCONFIGURED = {"llm_api_key": "", "llm_model": "", "llm_base_url": ""}


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app(Settings(frontend_dir=None, **UNCONFIGURED)))


def synthetic(fps: float = 240.0, seconds: float = 4.0) -> list[float]:
    """A 25 Hz oscillation with a half-amplitude 2x component, like misalignment."""
    t = np.arange(int(fps * seconds)) / fps
    signal = 10.0 * np.sin(2 * np.pi * 25.0 * t) + 5.0 * np.sin(2 * np.pi * 50.0 * t) + 100.0
    return signal.tolist()


def test_recovers_known_frequencies_and_harmonics(client: TestClient) -> None:
    response = client.post(
        "/api/video/analyze",
        json={"fps": 240.0, "samples": synthetic(), "nominal_rpm": 1500.0},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "video"
    assert body["nyquist_hz"] == 120.0
    assert body["duration_s"] == 4.0
    # The strongest peak is the 25 Hz fundamental; the second is its 2x at 50 Hz.
    assert abs(body["peaks"][0]["freq_hz"] - 25.0) < 0.3
    assert abs(body["peaks"][1]["freq_hz"] - 50.0) < 0.3
    # Shaft estimate locks on to 25 Hz (1500 RPM) and the 2x/1x ratio is about one half.
    assert abs(body["shaft_hz_estimate"] - 25.0) < 0.3
    orders = {h["order"]: h["amplitude"] for h in body["harmonics"]}
    assert set(orders) == {1, 2, 3}
    assert orders[2] / orders[1] == pytest.approx(0.5, abs=0.05)
    assert body["note"].startswith("Experimental video vibrometry")


def test_spectrum_stops_at_nyquist(client: TestClient) -> None:
    response = client.post("/api/video/analyze", json={"fps": 30.0, "samples": synthetic(30.0)})
    body = response.json()
    assert body["nyquist_hz"] == 15.0
    assert max(body["spectrum_freq_hz"]) <= 15.0
    assert body["shaft_hz_estimate"] is None
    assert body["harmonics"] == []


def test_request_schema_is_closed(client: TestClient) -> None:
    good = {"fps": 240.0, "samples": synthetic()}
    assert client.post("/api/video/analyze", json={**good, "extra": 1}).status_code == 422
    assert client.post("/api/video/analyze", json={**good, "fps": 2.0}).status_code == 422
    assert (
        client.post("/api/video/analyze", json={"fps": 240.0, "samples": [1.0] * 63}).status_code
        == 422
    )
    too_long = {"fps": 240.0, "samples": [0.0] * 20_001}
    assert client.post("/api/video/analyze", json=too_long).status_code == 422


def test_constant_signal_yields_no_crest_blowup(client: TestClient) -> None:
    response = client.post("/api/video/analyze", json={"fps": 60.0, "samples": [7.0] * 128})
    body = response.json()
    assert response.status_code == 200
    assert body["rms"] == 0.0
    assert body["crest_factor"] == 0.0


FEATURES = {
    "fps": 240.0,
    "duration_s": 4.0,
    "nyquist_hz": 120.0,
    "rms": 7.9,
    "crest_factor": 1.9,
    "peaks": [{"freq_hz": 25.0, "amplitude": 10.0}, {"freq_hz": 50.0, "amplitude": 5.0}],
    "shaft_hz_estimate": 25.0,
    "harmonics": [
        {"order": 1, "freq_hz": 25.0, "amplitude": 10.0},
        {"order": 2, "freq_hz": 50.0, "amplitude": 5.0},
    ],
    "nominal_rpm": 1500.0,
    "context": "Workshop fan, filmed at 240 fps slow motion.",
}


class FakeChat:
    model = "fake"
    last_usage: dict[str, int] | None = None

    def complete(self, system: str, user: str) -> str:
        self.last_usage = {"prompt_tokens": 10, "completion_tokens": 5}
        return '{"assessment": "Strong 2x over 1x is consistent with misalignment-like forcing."}'

    def __enter__(self) -> "FakeChat":
        return self

    def __exit__(self, *exc: object) -> None:
        pass


def configured_client() -> TestClient:
    settings = Settings(
        frontend_dir=None, llm_api_key="k", llm_model="fake", llm_base_url="http://localhost"
    )
    return TestClient(create_app(settings))


def test_assess_returns_503_without_model(client: TestClient) -> None:
    assert client.post("/api/video/assess", json=FEATURES).status_code == 503


def test_assess_reads_features_with_fake_model(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.api.video as video_api

    monkeypatch.setattr(
        video_api.ChatCompletionsClient, "from_settings", classmethod(lambda cls, s: FakeChat())
    )
    response = configured_client().post("/api/video/assess", json=FEATURES)
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True and body["fallback"] is False
    assert "misalignment" in body["assessment"]
    assert body["note"].startswith("Experimental video vibrometry")


def test_assess_falls_back_on_model_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.api.video as video_api

    class Broken(FakeChat):
        def complete(self, system: str, user: str) -> str:
            raise LLMError("timeout", "slow")

    monkeypatch.setattr(
        video_api.ChatCompletionsClient, "from_settings", classmethod(lambda cls, s: Broken())
    )
    response = configured_client().post("/api/video/assess", json=FEATURES)
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False and body["fallback"] is True
    assert "could not assess" in body["assessment"]
    assert "25.0 Hz" in body["assessment"]
