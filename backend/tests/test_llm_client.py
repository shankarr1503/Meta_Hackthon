"""Model adapter against a mocked HTTP transport, plus a live smoke test (skipped
unless backend/.env configures the Meta model)."""

import json

import httpx
import pytest

from app.agent.llm_client import MAX_RESPONSE_CHARS, ChatCompletionsClient, LLMError
from app.config import Settings


def _client(handler) -> ChatCompletionsClient:
    return ChatCompletionsClient(
        "https://llm.example.invalid/v1/",
        "test-key",
        "test-model",
        5.0,
        httpx.MockTransport(handler),
    )


def _ok(content: str, usage: dict | None = None) -> httpx.Response:
    body = {"choices": [{"message": {"role": "assistant", "content": content}}]}
    if usage is not None:
        body["usage"] = usage
    return httpx.Response(200, json=body)


def test_request_shape_and_reply() -> None:
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["Authorization"]
        seen["body"] = json.loads(request.content)
        return _ok('{"a": 1}', {"prompt_tokens": 12, "completion_tokens": 3, "total_tokens": 15})

    client = _client(handler)
    assert client.complete("sys", "user") == '{"a": 1}'
    assert seen["url"] == "https://llm.example.invalid/v1/chat/completions"
    assert seen["auth"] == "Bearer test-key"
    assert seen["body"]["model"] == "test-model"
    assert seen["body"]["temperature"] == 0.2
    assert [m["role"] for m in seen["body"]["messages"]] == ["system", "user"]
    assert client.last_usage == {"prompt_tokens": 12, "completion_tokens": 3, "total_tokens": 15}


def test_reply_is_capped() -> None:
    assert len(_client(lambda r: _ok("x" * 20_000)).complete("s", "u")) == MAX_RESPONSE_CHARS


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500, json={"error": "boom"}),
        httpx.Response(401, json={"error": "bad key"}),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"choices": []}),
        httpx.Response(200, json={"choices": [{"message": {"content": "  "}}]}),
        httpx.Response(200, json={"choices": [{"message": {"content": None}}]}),
    ],
)
def test_bad_responses_raise_llm_error(response: httpx.Response) -> None:
    with pytest.raises(LLMError):
        _client(lambda r: response).complete("s", "u")


@pytest.mark.parametrize("error", [httpx.ReadTimeout("slow"), httpx.ConnectError("down")])
def test_transport_failures_raise_llm_error(error: Exception) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise error

    with pytest.raises(LLMError):
        _client(handler).complete("s", "u")


def test_error_messages_never_include_the_key() -> None:
    with pytest.raises(LLMError) as caught:
        _client(lambda r: httpx.Response(403, text="test-key rejected")).complete("s", "u")
    assert "test-key" not in str(caught.value)


LIVE = Settings()


@pytest.mark.skipif(not LIVE.llm_configured, reason="Meta model not configured in backend/.env")
def test_live_model_returns_json() -> None:
    client = ChatCompletionsClient.from_settings(LIVE)
    reply = client.complete(
        "Reply with one JSON object only.", 'Return {"status": "ok"} and nothing else.'
    )
    assert "ok" in reply


def test_unexpected_client_errors_raise_llm_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise RuntimeError("misconfigured")

    with pytest.raises(LLMError):
        _client(handler).complete("s", "u")


def test_bad_base_url_raises_llm_error() -> None:
    client = ChatCompletionsClient("not a url", "k", "m", 1.0)
    with pytest.raises(LLMError):
        client.complete("s", "u")


def test_client_closes_its_connection_pool() -> None:
    with _client(lambda r: _ok("{}")) as client:
        client.complete("s", "u")
    assert client._client.is_closed
