"""Benchmark planners on sealed and generated cases. All data is simulated.

Rule planners (default):  python scripts/benchmark.py
Meta model (separate):    python scripts/benchmark.py --planner meta [--max-calls 200]

This script may read ground-truth labels to score; `app/` never imports it. Results are
merged into results/benchmark.json, one entry per planner, so a Meta run keeps the rule
results and vice versa. Meta responses are cached in results/llm_cache.json (git-ignored),
keyed by a hash of the prompt, so re-runs cost nothing for prompts already answered.
"""

import argparse
import hashlib
import json
import sys
import time
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))  # run from any folder without relying on the install

from app.agent.investigate import investigate  # noqa: E402
from app.agent.llm_client import ChatCompletionsClient, LLMClient, LLMError  # noqa: E402
from app.agent.meta_planner import MetaPlanner  # noqa: E402
from app.agent.planners import Planner, rule_planner  # noqa: E402
from app.cases import SEALED_CASES, Scenario, random_scenarios  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.inference.engine import BUDGET, CONFIDENCE_TARGET  # noqa: E402
from app.physics.model import MODEL_VERSION  # noqa: E402
from app.runner import make_runner  # noqa: E402

RESULTS_DIR = BACKEND_DIR / "results"
RESULTS_FILE = RESULTS_DIR / "benchmark.json"
CACHE_FILE = RESULTS_DIR / "llm_cache.json"
RULE_PLANNERS = ("info_gain", "sweep", "random")
GENERATED_SEED = 2026


@dataclass(frozen=True)
class Protocol:
    sealed_seeds: int
    generated_per_hypothesis: int


RULE_PROTOCOL = Protocol(sealed_seeds=5, generated_per_hypothesis=20)
META_PROTOCOL = Protocol(sealed_seeds=3, generated_per_hypothesis=0)


@dataclass(frozen=True)
class Outcome:
    group: str
    truth: str
    top: str
    confident: bool
    experiments: int
    cost: int
    model_calls: int
    fallbacks: int


class CachedClient:
    """Wraps a model client with a prompt-hash cache and a hard call limit."""

    def __init__(self, inner: LLMClient, cache: dict[str, str], max_calls: int) -> None:
        self.model = inner.model
        self.last_usage: dict[str, int] | None = None
        self.calls = 0
        self._inner, self._cache, self._max_calls = inner, cache, max_calls

    def complete(self, system: str, user: str) -> str:
        key = hashlib.sha256(f"{self.model}\n{system}\n{user}".encode()).hexdigest()
        if key in self._cache:
            self.last_usage = None
            return self._cache[key]
        if self.calls >= self._max_calls:
            raise LLMError("benchmark call limit reached")
        self.calls += 1
        reply = self._inner.complete(system, user)
        self.last_usage = self._inner.last_usage
        self._cache[key] = reply
        return reply


def cases_for(protocol: Protocol) -> list[tuple[str, Scenario, int]]:
    """(group, scenario, seed) for every run in the protocol."""
    runs = [
        ("sealed", case, seed) for case in SEALED_CASES for seed in range(protocol.sealed_seeds)
    ]
    generated = random_scenarios(protocol.generated_per_hypothesis, GENERATED_SEED)
    return runs + [("generated", case, 0) for case in generated]


def run_one(group: str, scenario: Scenario, seed: int, planner: Planner) -> Outcome:
    trace = investigate(scenario.view(), make_runner(scenario, seed), planner, seed)
    events = trace["llm_events"]
    return Outcome(
        group=group,
        truth=scenario.truth,
        top=trace["diagnosis"]["top"],
        confident=trace["diagnosis"]["confident"],
        experiments=trace["experiments"],
        cost=trace["cost"],
        model_calls=len(events),
        fallbacks=sum(1 for e in events if e["fallback"]),
    )


def _mean(values: list[float]) -> float:
    return round(sum(values) / len(values), 4) if values else 0.0


def metrics(outcomes: list[Outcome]) -> dict[str, Any]:
    confident = [o for o in outcomes if o.confident]
    calls = sum(o.model_calls for o in outcomes)
    return {
        "runs": len(outcomes),
        "accuracy": _mean([o.top == o.truth for o in outcomes]),
        "mean_experiments": _mean([o.experiments for o in outcomes]),
        "mean_cost": _mean([o.cost for o in outcomes]),
        "reached_target": _mean([o.confident for o in outcomes]),
        "accuracy_when_confident": _mean([o.top == o.truth for o in confident])
        if confident
        else None,
        "fallback_rate": round(sum(o.fallbacks for o in outcomes) / calls, 4) if calls else None,
    }


def summarise(outcomes: list[Outcome]) -> dict[str, dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {"all": metrics(outcomes)}
    for group in sorted({o.group for o in outcomes}):
        groups[group] = metrics([o for o in outcomes if o.group == group])
    for truth in sorted({o.truth for o in outcomes}):
        groups[f"truth:{truth}"] = metrics([o for o in outcomes if o.truth == truth])
    return groups


def benchmark_planner(
    name: str, protocol: Protocol, make_planner, progress: bool = False
) -> tuple[dict[str, Any], float]:
    start = time.perf_counter()
    outcomes = []
    for index, (group, scenario, seed) in enumerate(cases_for(protocol), start=1):
        outcomes.append(run_one(group, scenario, seed, make_planner()))
        if progress and index % 25 == 0:
            print(f"  {name}: {index} runs", flush=True)
    return summarise(outcomes), round(time.perf_counter() - start, 2)


def merge_results(path: Path, entries: dict[str, Any], protocols: dict[str, Any]) -> dict:
    existing = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    result = {
        "source": "simulation",
        "model_version": MODEL_VERSION,
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rules": {"budget": BUDGET, "confidence_target": CONFIDENCE_TARGET},
        "protocols": existing.get("protocols", {}) | protocols,
        "planners": existing.get("planners", {}) | entries,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def _protocol_dict(protocol: Protocol, runtime_s: float, extra: dict | None = None) -> dict:
    return {
        "sealed_seeds": protocol.sealed_seeds,
        "generated_per_hypothesis": protocol.generated_per_hypothesis,
        "generated_seed": GENERATED_SEED,
        "runtime_s": runtime_s,
    } | (extra or {})


def run_rules(planners: Iterable[str], protocol: Protocol, out: Path) -> dict:
    entries, protocols = {}, {}
    for name in planners:
        entries[name], runtime = benchmark_planner(
            name, protocol, lambda n=name: rule_planner(n), progress=True
        )
        protocols[name] = _protocol_dict(protocol, runtime)
        print(f"{name}: accuracy {entries[name]['all']['accuracy']:.1%} in {runtime:.1f} s")
    return merge_results(out, entries, protocols)


def run_meta(protocol: Protocol, max_calls: int, out: Path, cache_file: Path) -> dict:
    settings = get_settings()
    if not settings.llm_configured:
        sys.exit("Meta model not configured: fill FAILURELAB_LLM_* in backend/.env")
    cache = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.is_file() else {}
    client = CachedClient(ChatCompletionsClient.from_settings(settings), cache, max_calls)
    try:
        entry, runtime = benchmark_planner("meta", protocol, lambda: MetaPlanner(client), True)
    finally:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(cache, indent=1), encoding="utf-8")
    extra = {"model": settings.llm_model, "new_model_calls": client.calls, "max_calls": max_calls}
    print(f"meta: accuracy {entry['all']['accuracy']:.1%}, {client.calls} new model calls")
    return merge_results(out, {"meta": entry}, {"meta": _protocol_dict(protocol, runtime, extra)})


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--planner", choices=(*RULE_PLANNERS, "meta", "rules"), default="rules")
    parser.add_argument("--max-calls", type=int, default=200, help="Meta: new model calls cap")
    parser.add_argument("--seeds", type=int, help="override seeds per sealed case")
    parser.add_argument("--out", type=Path, default=RESULTS_FILE)
    args = parser.parse_args(argv)
    if args.planner == "meta":
        protocol = META_PROTOCOL
        if args.seeds is not None:
            protocol = Protocol(args.seeds, protocol.generated_per_hypothesis)
        run_meta(protocol, args.max_calls, args.out, CACHE_FILE)
        return
    protocol = RULE_PROTOCOL
    if args.seeds is not None:
        protocol = Protocol(args.seeds, protocol.generated_per_hypothesis)
    planners = RULE_PLANNERS if args.planner == "rules" else (args.planner,)
    run_rules(planners, protocol, args.out)


if __name__ == "__main__":
    main()
