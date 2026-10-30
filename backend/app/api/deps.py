"""Shared route dependencies."""

from fastapi import HTTPException, Request

from app.cases import Scenario, get_scenario
from app.config import Settings


def settings_of(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def scenario_or_404(case_id: str) -> Scenario:
    scenario = get_scenario(case_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail=f"Unknown case {case_id!r}")
    return scenario
