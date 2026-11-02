"""Application settings, read from backend/.env with the FAILURELAB_ prefix."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"

SERVICE_NAME = "failurelab-ai"
VERSION = "0.1.0"
CONTRACT_VERSION = "1"


class Settings(BaseSettings):
    """Runtime configuration. Secrets are SecretStr and never returned by the API."""

    model_config = SettingsConfigDict(
        env_prefix="FAILURELAB_",
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_provider: str = "meta"
    llm_api_key: SecretStr = SecretStr("")
    llm_model: str = ""
    llm_base_url: str = ""
    llm_timeout_s: float = 60.0
    # Muse Spark always reasons; "low" keeps each call fast and cheap. Empty = API default.
    llm_reasoning_effort: Literal["", "minimal", "low", "medium", "high", "xhigh"] = "low"
    # Meta investigations the API will start per rolling hour (each makes up to ~10 calls).
    meta_runs_per_hour: int = Field(30, ge=0)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    replays_dir: Path = BACKEND_DIR / "replays"
    results_dir: Path = BACKEND_DIR / "results"
    frontend_dir: Path | None = None

    @property
    def llm_configured(self) -> bool:
        """True when key, model and endpoint are all set."""
        return bool(self.llm_api_key.get_secret_value() and self.llm_model and self.llm_base_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
