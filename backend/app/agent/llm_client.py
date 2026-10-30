"""Model adapter: one `complete(system, user) -> str` interface over the Meta model endpoint.

Speaks the OpenAI-compatible chat-completions format of Meta's Model API
(`POST https://api.meta.ai/v1/chat/completions`, Bearer key; D-55). Muse Spark models
always reason before answering, so the output budget (`max_completion_tokens`) leaves room
for reasoning and `reasoning_effort` keeps it short. Every failure is raised as LLMError so
the planner can fall back. The key is read from settings and never logged or returned.
"""

from typing import Any, Protocol

import httpx

from app.config import Settings

TEMPERATURE = 0.2
MAX_COMPLETION_TOKENS = 4000  # reasoning + the JSON answer share this budget
REASONING_EFFORTS = ("minimal", "low", "medium", "high", "xhigh")
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
        timeout_s: float = 60.0,
        transport: httpx.BaseTransport | None = None,
        reasoning_effort: str | None = "low",
    ) -> None:
        if reasoning_effort is not None and reasoning_effort not in REASONING_EFFORTS:
            raise ValueError(f"reasoning_effort must be one of {REASONING_EFFORTS}")
        self.model = model
        self.reasoning_effort = reasoning_effort
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
            reasoning_effort=settings.llm_reasoning_effort or None,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "ChatCompletionsClient":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def complete(self, system: str, user: str) -> str:
        payload: dict[str, Any] = {
            "model": self.model,
            "temperature": TEMPERATURE,
            "max_completion_tokens": MAX_COMPLETION_TOKENS,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if self.reasoning_effort is not None:
            payload["reasoning_effort"] = self.reasoning_effort
        self.last_usage = None
        try:
            response = self._client.post(self._url, json=payload, headers=self._headers)
        except httpx.TimeoutException as error:
            raise LLMError("model request timed out") from error
        except Exception as error:  # any client failure (bad URL, bad header) must fall back
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
