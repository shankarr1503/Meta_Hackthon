"""Shared route dependencies."""

from fastapi import HTTPException, Request

from app.cases import Scenario, get_scenario
from app.config import Settings


def settings_of(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def reject_cross_site(request: Request) -> None:
    """Refuse requests a browser marks as coming from another site.

    A GET with side effects (the live stream starts a paid Meta run) could otherwise be
    triggered by any web page through a no-cors request. Non-browser clients send no
    Sec-Fetch-Site header and are unaffected.
    """
    site = request.headers.get("sec-fetch-site")
    origin = request.headers.get("origin")
    settings = settings_of(request)
    if site == "cross-site":
        raise HTTPException(status_code=403, detail="Cross-site requests are not allowed")
    if site is None and origin is not None:
        same_host = origin.split("://", 1)[-1] == request.headers.get("host")
        if not same_host and origin not in settings.cors_origins:
            raise HTTPException(status_code=403, detail="Cross-site requests are not allowed")


def scenario_or_404(case_id: str) -> Scenario:
    scenario = get_scenario(case_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail=f"Unknown case {case_id!r}")
    return scenario
