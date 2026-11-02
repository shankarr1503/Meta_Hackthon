"""Cases, single experiments and the manual lab. Every number comes from the simulator."""

import numpy as np
from fastapi import APIRouter, HTTPException

from app.agent.investigate import feature_fields, rounded, signal_fields
from app.api.deps import scenario_or_404
from app.cases import public_cases
from app.physics.model import (
    MODEL_VERSION,
    Faults,
    Machine,
    Measurement,
    measure,
    predict_for,
)
from app.runner import make_runner
from app.schemas.simulation import CaseOut, ExperimentOut, ExperimentRequest, LabOut, LabRequest

router = APIRouter(prefix="/api", tags=["simulation"])

# The public preset lab machine (D-19): not a sealed case.
LAB_MACHINE = Machine(wn_rpm=3600.0, thermal=1.0)
LAB_CURVE_RPM = [float(rpm) for rpm in range(0, 6001, 100)]


def _experiment_fields(measurement: Measurement) -> dict:
    return (
        feature_fields(measurement) | signal_fields(measurement) | {"model_version": MODEL_VERSION}
    )


@router.get("/cases", response_model=list[CaseOut])
def list_cases() -> list[CaseOut]:
    return [CaseOut(**vars(case)) for case in public_cases()]


@router.get("/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: str) -> CaseOut:
    """Public fields of one case: a sealed case or a fresh machine `fresh-<seed>` (D-74)."""
    if not 1 <= len(case_id) <= 64:
        raise HTTPException(status_code=404, detail=f"Unknown case {case_id!r}")
    return CaseOut(**vars(scenario_or_404(case_id).view()))


@router.post("/experiments", response_model=ExperimentOut)
def run_experiment(request: ExperimentRequest) -> ExperimentOut:
    scenario = scenario_or_404(request.case_id)
    run = make_runner(scenario, request.seed, request.duration_s, request.sample_rate_hz)
    try:
        measurement = run(request.rpm, request.load_n, 0)
    except ValueError as error:  # too few samples for the requested duration and rate
        raise HTTPException(status_code=422, detail=str(error)) from error
    return ExperimentOut(**_experiment_fields(measurement), kind="case")


@router.post("/lab/simulate", response_model=LabOut)
def lab_simulate(request: LabRequest) -> LabOut:
    faults = Faults(request.imbalance, request.misalignment, request.friction)
    rng = np.random.default_rng([request.seed, 7])
    measurement = measure(faults, LAB_MACHINE, request.rpm, request.load_n, rng)
    curve = predict_for(faults, LAB_MACHINE, np.array(LAB_CURVE_RPM), request.load_n)
    return LabOut(
        **_experiment_fields(measurement),
        curve_rpm=LAB_CURVE_RPM,
        curve_amp_1x_um=rounded(curve.amp_1x_um),
        curve_amp_2x_um=rounded(curve.amp_2x_um),
    )
