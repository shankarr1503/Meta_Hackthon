"""Cases, single experiments and the manual lab. Every number comes from the simulator."""

import numpy as np
from fastapi import APIRouter, HTTPException

from app.api.deps import scenario_or_404
from app.cases import public_cases
from app.physics.model import (
    MODEL_VERSION,
    Faults,
    Machine,
    Measurement,
    measure,
    predict_for,
    spectrum,
    waveform_preview,
)
from app.runner import make_runner
from app.schemas.simulation import CaseOut, ExperimentOut, ExperimentRequest, LabOut, LabRequest

router = APIRouter(prefix="/api", tags=["simulation"])

# The public preset lab machine (D-19): not a sealed case.
LAB_MACHINE = Machine(wn_rpm=3600.0, thermal=1.0)
LAB_CURVE_RPM = [float(rpm) for rpm in range(0, 6001, 100)]
DECIMALS = 4


def _round(values) -> list[float]:
    return [round(float(v), DECIMALS) for v in values]


def _experiment_fields(measurement: Measurement) -> dict:
    time_s, displacement = waveform_preview(measurement.displacement_um, measurement.sample_rate_hz)
    freq, amp = spectrum(measurement.displacement_um, measurement.sample_rate_hz)
    f = measurement.features
    return {
        "amp_1x_um": round(f.amp_1x_um, DECIMALS),
        "amp_2x_um": round(f.amp_2x_um, DECIMALS),
        "broadband_um": round(f.broadband_um, DECIMALS),
        "temp_rise_c": round(f.temp_rise_c, DECIMALS),
        "time_s": _round(time_s),
        "displacement_um": _round(displacement),
        "spectrum_freq_hz": _round(freq),
        "spectrum_amp_um": _round(amp),
        "model_version": MODEL_VERSION,
    }


@router.get("/cases", response_model=list[CaseOut])
def list_cases() -> list[CaseOut]:
    return [CaseOut(**vars(case)) for case in public_cases()]


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
        curve_amp_1x_um=_round(curve.amp_1x_um),
        curve_amp_2x_um=_round(curve.amp_2x_um),
    )
