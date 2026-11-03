"""Benchmark script on a tiny protocol, its model cache and call limit, and the API."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.agent.llm_client import LLMError
from app.main import create_app
from scripts.benchmark import (
    RESULTS_FILE,
    RULE_BUDGET_S,
    RULE_PLANNERS,
    BudgetExceededError,
    CachedClient,
    Protocol,
    cases_for,
    main,
    run_rules,
)

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


def test_rule_benchmark_enforces_time_budget(tmp_path: Path) -> None:
    out = tmp_path / "benchmark.json"
    with pytest.raises(BudgetExceededError):
        run_rules(["sweep"], TINY, out, budget_s=0)
    result = run_rules(["sweep"], TINY, out)
    assert result["protocols"]["sweep"]["runtime_s"] >= 0


def test_committed_rule_benchmark_is_within_budget() -> None:
    if not RESULTS_FILE.is_file():
        pytest.skip("rule benchmark has not been run yet")
    stored = json.loads(RESULTS_FILE.read_text(encoding="utf-8"))
    runtimes = [stored["protocols"][name]["runtime_s"] for name in RULE_PLANNERS]
    assert max(runtimes) <= RULE_BUDGET_S
    assert sum(runtimes) <= RULE_BUDGET_S


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


def test_meta_benchmark_adds_like_for_like_baseline(tmp_path: Path, monkeypatch) -> None:
    from scripts import benchmark
    from tests.test_meta_planner import smart_reply

    class FakeChat:
        model = "fake"
        last_usage = None

        def complete(self, system: str, user: str) -> str:
            return smart_reply(user)

        def __enter__(self):
            return self

        def __exit__(self, *exc: object) -> None:
            pass

    class Configured:
        llm_configured = True
        llm_model = "fake"

    monkeypatch.setattr(benchmark, "get_settings", lambda: Configured())
    monkeypatch.setattr(benchmark.ChatCompletionsClient, "from_settings", lambda s: FakeChat())
    out = tmp_path / "b.json"
    result = benchmark.run_meta(Protocol(1, 0), 500, out, tmp_path / "cache.json")
    meta = result["planners"]["meta"]["all"]
    baseline = result["planners"][benchmark.SAME_CASES_BASELINE]["all"]
    assert meta["runs"] == baseline["runs"] == 6
    assert meta["fallback_rate"] == 0
    assert result["protocols"]["meta"]["model"] == "fake"
    assert result["protocols"]["meta"]["model_version"] == "rotor-1"
    assert (tmp_path / "cache.json").is_file()
