"""Request and response models for experimental video vibrometry (closed schemas)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class VideoAnalyzeRequest(BaseModel):
    """A motion time series extracted client-side from a user's video.

    The browser samples the brightness of a user-chosen point across frames; the
    numbers are in arbitrary pixel units. No video file reaches the server.
    """

    model_config = ConfigDict(extra="forbid")

    fps: float = Field(ge=5.0, le=1000.0, description="Video frame rate the samples were taken at")
    samples: list[float] = Field(min_length=64, max_length=20_000)
    nominal_rpm: float | None = Field(
        default=None, ge=60.0, le=30_000.0, description="Machine speed, if the user knows it"
    )


class SpectrumPeak(BaseModel):
    model_config = ConfigDict(extra="forbid")

    freq_hz: float
    amplitude: float


class Harmonic(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order: int
    freq_hz: float
    amplitude: float


class VideoAssessRequest(BaseModel):
    """Derived features from a video analysis, sent back for a Meta model reading."""

    model_config = ConfigDict(extra="forbid")

    fps: float = Field(ge=5.0, le=1000.0)
    duration_s: float = Field(ge=0.1, le=600.0)
    nyquist_hz: float = Field(ge=2.5, le=500.0)
    rms: float = Field(ge=0.0)
    crest_factor: float = Field(ge=0.0)
    peaks: list[SpectrumPeak] = Field(max_length=5)
    shaft_hz_estimate: float | None = Field(default=None, ge=0.0)
    harmonics: list[Harmonic] = Field(default_factory=list, max_length=3)
    nominal_rpm: float | None = Field(default=None, ge=60.0, le=30_000.0)
    context: str = Field(default="", max_length=300)


class VideoAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assessment: str
    model: str
    ok: bool
    fallback: bool
    usage: dict[str, int] | None = None
    error_kind: str | None = None
    error: str | None = None
    note: str


class VideoAnalyzeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Literal["video"]
    sample_rate_hz: float
    duration_s: float
    nyquist_hz: float
    rms: float
    crest_factor: float
    waveform_t_s: list[float]
    waveform: list[float]
    spectrum_freq_hz: list[float]
    spectrum: list[float]
    peaks: list[SpectrumPeak]
    shaft_hz_estimate: float | None
    harmonics: list[Harmonic]
    note: str
