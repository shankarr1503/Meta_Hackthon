"""Production assets share the API origin; only the configured build is exposed."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def test_dashboard_and_api_share_one_origin(tmp_path, make_settings) -> None:
    build = tmp_path / "dist"
    assets = build / "assets"
    assets.mkdir(parents=True)
    (build / "index.html").write_text("<html>FailureLab dashboard</html>", encoding="utf-8")
    (assets / "app.js").write_text("console.log('simulated');", encoding="utf-8")
    (tmp_path / ".env").write_text("private-configuration", encoding="utf-8")
    client = TestClient(create_app(make_settings(frontend_dir=build)))

    assert "FailureLab dashboard" in client.get("/").text
    script = client.get("/assets/app.js")
    assert script.status_code == 200
    assert "javascript" in script.headers["content-type"]
    assert client.get("/api/health").json()["status"] == "ok"
    assert len(client.get("/api/cases").json()) == 6
    assert client.get("/api/does-not-exist").status_code == 404
    for url in ("/.env", "/%2e%2e/.env", "/backend/.env", "/assets/missing.js"):
        response = client.get(url)
        assert response.status_code == 404
        assert "private-configuration" not in response.text


def test_dashboard_requires_a_build(tmp_path, make_settings) -> None:
    with pytest.raises(RuntimeError, match="Frontend build missing"):
        create_app(make_settings(frontend_dir=tmp_path))


def test_api_only_mode_keeps_root_unmounted(make_settings) -> None:
    client = TestClient(create_app(make_settings()))
    assert client.get("/").status_code == 404
    assert client.get("/api/health").status_code == 200
