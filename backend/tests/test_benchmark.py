"""Benchmark script on a tiny protocol, its model cache and call limit, and the API."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.agent.llm_client import LLMError
from app.main import create_app
from scripts.benchmark import CachedClient, Protocol, cases_for, main, run_rules

TINY = Protocol(sealed_seeds=1, generated_per_hypothesis=1)


class CountingClient:
    model = "fake"
    last_usage = None

    def __init__(self) -> None:
        self.calls = 0

    def complete(self, system: str, user: str) -> str:
        self.calls += 1
        return f"reply {self.calls}"


def test_protocol_cases() -> None:
    runs = cases_for(Protocol(sealed_seeds=2, generated_per_hypothesis=3))
    assert sum(1 for group, _, _ in runs if group == "sealed") == 12
    assert sum(1 for group, _, _ in runs if group == "generated") == 18


def test_rule_benchmark_writes_and_merges_results(tmp_path: Path) -> None:
    out = tmp_path / "benchmark.json"
    run_rules(["sweep"], TINY, out)
    result = run_rules(["random"], TINY, out)
    assert result["source"] == "simulation"
    assert set(result["planners"]) == {"sweep", "random"}
    sweep = result["planners"]["sweep"]
    assert sweep["all"]["runs"] == 12
    assert {"sealed", "generated", "truth:healthy"} <= set(sweep)
    assert 0 <= sweep["all"]["accuracy"] <= 1
    assert sweep["all"]["fallback_rate"] is None
    assert json.loads(out.read_text(encoding="utf-8")) == result


def test_cli_single_planner(tmp_path: Path) -> None:
    out = tmp_path / "b.json"
    main(["--planner", "random", "--seeds", "1", "--out", str(out)])
    assert set(json.loads(out.read_text(encoding="utf-8"))["planners"]) == {"random"}


def test_cached_client_reuses_answers_and_enforces_limit() -> None:
    inner, cache = CountingClient(), {}
    client = CachedClient(inner, cache, max_calls=2)
    assert client.complete("s", "a") == "reply 1"
    assert client.complete("s", "a") == "reply 1"
    assert client.complete("s", "b") == "reply 2"
    with pytest.raises(LLMError):
        client.complete("s", "c")
    assert inner.calls == client.calls == 2
    assert len(cache) == 2


def test_benchmark_api(make_settings) -> None:
    settings = make_settings()
    client = TestClient(create_app(settings))
    assert client.get("/api/benchmark").status_code == 404
    run_rules(["sweep"], TINY, settings.results_dir / "benchmark.json")
    body = client.get("/api/benchmark").json()
    assert body["source"] == "simulation"
    assert body["planners"]["sweep"]["all"]["runs"] == 12
