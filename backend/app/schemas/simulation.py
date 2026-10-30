"""Request and response models for cases, single experiments and the manual lab.

Request models forbid extra keys, so no label or hidden field can be smuggled in.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CaseOut(Closed):
    """The public case fields, exactly (D-17)."""

    case_id: str
    title: str
    note: str
    initial_rpm: float
    initial_load_n: float


class ExperimentRequest(Closed):
    case_id: str = Field(min_length=1, max_length=64)
    rpm: float = Field(ge=0, le=6000)
    load_n: float = Field(default=0, ge=0, le=5000)
    duration_s: float = Field(default=1.0, gt=0, le=10)
    sample_rate_hz: float = Field(default=5000.0, ge=500, le=50_000)
    seed: int = Field(default=0, ge=0, le=2**31 - 1)


class LabRequest(Closed):
    """Faults chosen by the user on the public preset machine (never a sealed case)."""

    imbalance: float = Field(default=0, ge=0, le=1)
    misalignment: float = Field(default=0, ge=0, le=1)
    friction: float = Field(default=0, ge=0, le=1)
    rpm: float = Field(ge=0, le=6000)
    load_n: float = Field(default=0, ge=0, le=5000)
    seed: int = Field(default=0, ge=0, le=2**31 - 1)


class ExperimentOut(Closed):
    """Features, waveform preview and spectrum of one simulated experiment."""

    amp_1x_um: float
    amp_2x_um: float
    broadband_um: float
    temp_rise_c: float
    time_s: list[float]
    displacement_um: list[float]
    spectrum_freq_hz: list[float]
    spectrum_amp_um: list[float]
    source: Literal["simulation"] = "simulation"
    kind: Literal["case", "lab"]
    model_version: str


class LabOut(ExperimentOut):
    """Lab reading plus the noise-free 1x and 2x response curve over speed."""

    kind: Literal["case", "lab"] = "lab"
    curve_rpm: list[float]
    curve_amp_1x_um: list[float]
    curve_amp_2x_um: list[float]
