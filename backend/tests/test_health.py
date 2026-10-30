from fastapi.testclient import TestClient

from app.main import create_app


def test_health_returns_200_with_contract_fields() -> None:
    client = TestClient(create_app())

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "failurelab-ai",
        "version": "0.1.0",
        "contract_version": "1",
    }


def test_health_does_not_expose_settings() -> None:
    client = TestClient(create_app())

    body = client.get("/api/health").text.lower()

    assert "api_key" not in body
    assert "base_url" not in body
