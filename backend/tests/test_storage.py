"""Replay storage and run ids: atomic saves, unreadable files, id reservation."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from threading import Barrier, local
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api import runs, storage
from app.api.runs import reserve_meta_id, run_and_save
from app.api.storage import ReplayStore
from app.cases import get_scenario
from app.main import create_app

NOW = datetime(2026, 10, 30, 12, 0, 0, tzinfo=UTC)


def test_save_leaves_no_temporary_file(tmp_path: Path) -> None:
    store = ReplayStore(tmp_path)
    store.save({"investigation_id": "case-k7-sweep-0", "x": 1})
    assert [p.name for p in tmp_path.iterdir()] == ["case-k7-sweep-0.json"]


def test_concurrent_saves_to_the_same_id_are_atomic(tmp_path: Path, monkeypatch) -> None:
    store = ReplayStore(tmp_path)
    barrier = Barrier(2)
    replace = storage.os.replace
    writer = local()

    def simultaneous_replace(source, destination):
        if not getattr(writer, "started", False):
            writer.started = True
            barrier.wait(timeout=10)
        replace(source, destination)

    monkeypatch.setattr(storage.os, "replace", simultaneous_replace)
    traces = [{"investigation_id": "case-k7-sweep-0", "writer": i} for i in range(2)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert len(list(pool.map(store.save, traces))) == 2
    assert store.load("case-k7-sweep-0") in traces
    assert [p.name for p in tmp_path.iterdir()] == ["case-k7-sweep-0.json"]


@pytest.mark.parametrize(
    ("platform", "failures", "attempts", "succeeds"),
    [("nt", 1, 2, True), ("nt", 5, 5, False), ("posix", 1, 1, False)],
)
def test_replacement_permission_retry_is_bounded(
    tmp_path, monkeypatch, platform, failures, attempts, succeeds
) -> None:
    replace = storage.os.replace
    calls = 0
    delays = []

    def flaky_replace(source, destination):
        nonlocal calls
        calls += 1
        if calls <= failures:
            raise PermissionError("destination busy")
        replace(source, destination)

    monkeypatch.setattr(storage, "os", SimpleNamespace(name=platform, replace=flaky_replace))
    monkeypatch.setattr(storage.time, "sleep", delays.append)
    store = ReplayStore(tmp_path)
    trace = {"investigation_id": "case-k7-sweep-0", "writer": 1}
    if succeeds:
        store.save(trace)
        assert store.load(trace["investigation_id"]) == trace
    else:
        with pytest.raises(PermissionError, match="destination busy"):
            store.save(trace)
        assert not store.exists(trace["investigation_id"])
    assert calls == attempts
    assert delays == [0.01 * i for i in range(1, attempts)]
    assert not list(tmp_path.glob("*.tmp"))


def test_unreadable_replays_are_skipped(make_settings) -> None:
    settings = make_settings()
    client = TestClient(create_app(settings))
    client.post("/api/investigations", json={"case_id": "case-k7", "planner": "sweep"})
    (settings.replays_dir / "case-k7-sweep-1.json").write_text("{half", encoding="utf-8")
    (settings.replays_dir / "case-k7-sweep-2.json").write_text('{"old": 1}', encoding="utf-8")
    listed = [s["investigation_id"] for s in client.get("/api/investigations").json()]
    assert listed == ["case-k7-sweep-0"]
    assert client.get("/api/investigations/case-k7-sweep-1").status_code == 404
    response = client.get("/api/investigations/case-k7-sweep-2")
    assert response.status_code == 404
    assert "older version" in response.json()["detail"]


def test_meta_ids_in_the_same_second_are_unique(tmp_path: Path) -> None:
    store = ReplayStore(tmp_path)
    first = reserve_meta_id(store, "case-k7", 0, NOW)
    second = reserve_meta_id(store, "case-k7", 0, NOW)
    assert first == "case-k7-meta-0-20261030120000"
    assert second == "case-k7-meta-0-20261030120000-2"


def test_failed_meta_run_releases_its_id(make_settings, monkeypatch) -> None:
    settings = make_settings(llm_api_key="k", llm_model="m", llm_base_url="https://x.invalid/v1")
    store = ReplayStore(settings.replays_dir)

    def boom(*args, **kwargs):
        raise RuntimeError("engine failure")

    monkeypatch.setattr(runs, "investigate", boom)
    with pytest.raises(RuntimeError):
        run_and_save(get_scenario("case-k7"), "meta", 0, settings, store)
    assert list(settings.replays_dir.glob("*.json")) == []
