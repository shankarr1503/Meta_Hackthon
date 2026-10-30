"""Model adapter: one `complete(system, user) -> str` interface over the Meta model endpoint.

Speaks the OpenAI-compatible chat-completions format (D-22). If the hackathon's endpoint
uses another format, only this file changes. Every failure is raised as LLMError so the
planner can fall back. The key is read from settings and never logged or returned.
"""

from typing import Any, Protocol

import httpx

from app.config import Settings

TEMPERATURE = 0.2
MAX_TOKENS = 700
MAX_RESPONSE_CHARS = 8000


class LLMError(RuntimeError):
    """Any model failure: timeout, HTTP error, malformed body, call limit."""


class LLMClient(Protocol):
    model: str
    last_usage: dict[str, int] | None

    def complete(self, system: str, user: str) -> str: ...


class ChatCompletionsClient:
    """Client for an OpenAI-compatible `POST {base_url}/chat/completions` endpoint."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout_s: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.model = model
        self.last_usage: dict[str, int] | None = None
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._client = httpx.Client(timeout=timeout_s, transport=transport)

    @classmethod
    def from_settings(cls, settings: Settings) -> "ChatCompletionsClient":
        return cls(
            settings.llm_base_url,
            settings.llm_api_key.get_secret_value(),
            settings.llm_model,
            settings.llm_timeout_s,
        )

    def complete(self, system: str, user: str) -> str:
        payload = {
            "model": self.model,
            "temperature": TEMPERATURE,
            "max_tokens": MAX_TOKENS,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        self.last_usage = None
        try:
            response = self._client.post(self._url, json=payload, headers=self._headers)
        except httpx.TimeoutException as error:
            raise LLMError("model request timed out") from error
        except httpx.HTTPError as error:
            raise LLMError(f"model request failed: {type(error).__name__}") from error
        if response.status_code != 200:
            raise LLMError(f"model returned HTTP {response.status_code}")
        return self._content(response)

    def _content(self, response: httpx.Response) -> str:
        try:
            body: dict[str, Any] = response.json()
            content = body["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise LLMError("model response has no message content") from error
        if not isinstance(content, str) or not content.strip():
            raise LLMError("model response content is empty")
        usage = body.get("usage")
        if isinstance(usage, dict):
            self.last_usage = {
                k: int(v) for k, v in usage.items() if k.endswith("_tokens") and isinstance(v, int)
            }
        return content[:MAX_RESPONSE_CHARS]
