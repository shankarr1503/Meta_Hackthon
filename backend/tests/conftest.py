from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def make_settings(tmp_path: Path) -> Callable[..., Settings]:
    """Settings isolated from backend/.env, with temporary replay and results folders."""

    def build(**overrides: Any) -> Settings:
        values: dict[str, Any] = {
            "llm_api_key": "",
            "llm_model": "",
            "llm_base_url": "",
            "replays_dir": tmp_path / "replays",
            "results_dir": tmp_path / "results",
        }
        return Settings(_env_file=None, **(values | overrides))  # type: ignore[call-arg]

    return build


@pytest.fixture
def client(make_settings: Callable[..., Settings]) -> TestClient:
    return TestClient(create_app(make_settings()))
