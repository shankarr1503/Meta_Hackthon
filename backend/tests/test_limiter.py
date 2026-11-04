"""Per-client throttling: one client must not exhaust the shared budget."""

from app.api.runs import MetaRunLimiter


def make(per_hour: int, now: list[float]) -> MetaRunLimiter:
    return MetaRunLimiter(per_hour, clock=lambda: now[0])


def test_one_client_cannot_exhaust_the_global_budget() -> None:
    now = [0.0]
    limiter = make(30, now)
    # Per-client share is a third of the global budget (30 -> 10).
    assert [limiter.try_start("client-a") for _ in range(10)] == [True] * 10
    assert limiter.try_start("client-a") is False
    # Other clients still have budget; the global cap is untouched by one client.
    assert limiter.try_start("client-b") is True


def test_global_cap_still_applies_across_clients() -> None:
    now = [0.0]
    limiter = make(6, now)
    # Per-client share is 2; three clients reach the global 6, a fourth is refused.
    for client in ("a", "b", "c"):
        assert limiter.try_start(client) is True
        assert limiter.try_start(client) is True
    assert limiter.try_start("d") is False


def test_per_client_window_slides() -> None:
    now = [0.0]
    limiter = make(3, now)
    assert limiter.try_start("a") is True
    assert limiter.try_start("a") is False  # per-client share of 3 is 1
    now[0] = 3600.0
    assert limiter.try_start("a") is True


def test_anonymous_calls_keep_the_global_only_behaviour() -> None:
    now = [0.0]
    limiter = make(2, now)
    assert limiter.try_start() and limiter.try_start() and not limiter.try_start()
