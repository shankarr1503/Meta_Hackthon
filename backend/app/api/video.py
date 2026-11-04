"""Experimental video vibrometry: spectrum and features from client-extracted motion.

The browser samples the brightness of a user-chosen point in the user's own video,
frame by frame, and sends only that time series here — never the video itself. This
route runs the same Hann-window spectrum used everywhere else in the app and reports
peaks, and, when the machine speed is given, the shaft harmonics below the Nyquist
limit. Amplitudes are in arbitrary pixel units: uncalibrated, and labelled so.
FFT work is O(n log n); peak picking is linear.
"""

from typing import Annotated

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request

from app.agent.llm_client import ChatCompletionsClient
from app.agent.meta_planner import assess_video
from app.api.deps import reject_cross_site, settings_of
from app.api.runs import META_NOT_CONFIGURED, MetaRunLimiter
from app.config import Settings
from app.physics.model import spectrum, waveform_preview
from app.schemas.video import (
    Harmonic,
    SpectrumPeak,
    VideoAnalyzeRequest,
    VideoAnalyzeResponse,
    VideoAssessment,
    VideoAssessRequest,
)

router = APIRouter(prefix="/api/video", tags=["video"])

SPEED_TOLERANCE = 0.15
MIN_PEAK_HZ = 0.5
MAX_PEAKS = 5

NOTE = (
    "Experimental video vibrometry: motion of one point, in arbitrary pixel units, "
    "readable only up to half the video frame rate. Not a calibrated measurement and "
    "not part of the validated benchmark or real-recordings evidence."
)


def _peaks(freq: np.ndarray, amp: np.ndarray) -> list[SpectrumPeak]:
    """The strongest local maxima above MIN_PEAK_HZ, strongest first."""
    inner = (amp[1:-1] > amp[:-2]) & (amp[1:-1] >= amp[2:])
    idx = np.flatnonzero(inner) + 1
    idx = idx[freq[idx] >= MIN_PEAK_HZ]
    top = idx[np.argsort(amp[idx])[::-1][:MAX_PEAKS]]
    return [SpectrumPeak(freq_hz=round(float(freq[i]), 3), amplitude=float(amp[i])) for i in top]


def _shaft_estimate(freq: np.ndarray, amp: np.ndarray, nominal_hz: float) -> float | None:
    """Frequency near the nominal speed whose visible harmonics carry the most energy."""
    lo, hi = nominal_hz * (1 - SPEED_TOLERANCE), nominal_hz * (1 + SPEED_TOLERANCE)
    candidates = freq[(freq >= lo) & (freq <= hi)]
    if candidates.size == 0:
        return None

    def energy(f0: float) -> float:
        total = 0.0
        for k in (1, 2, 3):
            band = (freq >= k * f0 - 0.5) & (freq <= k * f0 + 0.5)
            if band.any():
                total += float(amp[band].max())
        return total

    return float(max(candidates, key=energy))


@router.post("/assess", response_model=VideoAssessment, dependencies=[Depends(reject_cross_site)])
def assess(
    body: VideoAssessRequest,
    request: Request,
    settings: Annotated[Settings, Depends(settings_of)],
) -> VideoAssessment:
    """Ask the Meta model to read the extracted features (experimental; rate-limited).

    The model sees only the derived features and the user's context text. Any model
    failure returns a deterministic fallback with `ok: false`.
    """
    if not settings.llm_configured:
        raise HTTPException(status_code=503, detail=META_NOT_CONFIGURED)
    limiter: MetaRunLimiter = request.app.state.question_limiter
    if not limiter.try_start(request.client.host if request.client else "unknown"):
        raise HTTPException(status_code=429, detail="Hourly Meta question limit reached.")
    features = body.model_dump(mode="json", exclude={"context"})
    with ChatCompletionsClient.from_settings(settings) as client:
        result = assess_video(client, features, body.context)
    return VideoAssessment(**result, note=NOTE)


@router.post("/analyze", response_model=VideoAnalyzeResponse)
def analyze(body: VideoAnalyzeRequest, request: Request) -> VideoAnalyzeResponse:
    limiter: MetaRunLimiter = request.app.state.compute_limiter
    if not limiter.try_start(request.client.host if request.client else "unknown"):
        raise HTTPException(
            status_code=429,
            detail="The hourly compute limit for this server has been reached. Try again later.",
        )
    samples = np.asarray(body.samples, dtype=float)
    samples = samples - samples.mean()
    nyquist = body.fps / 2.0
    rms = float(np.sqrt(np.mean(samples**2)))
    crest = float(np.max(np.abs(samples)) / rms) if rms > 0 else 0.0

    freq, amp = spectrum(samples, body.fps, max_freq_hz=nyquist)
    time_s, wave = waveform_preview(samples, body.fps, window_s=2.0)

    shaft_hz = None
    harmonics: list[Harmonic] = []
    if body.nominal_rpm is not None:
        shaft_hz = _shaft_estimate(freq, amp, body.nominal_rpm / 60.0)
        if shaft_hz is not None:
            for order in (1, 2, 3):
                target = order * shaft_hz
                if target > nyquist:
                    break
                band = (freq >= target - 0.5) & (freq <= target + 0.5)
                if band.any():
                    peak = float(amp[band].max())
                    harmonics.append(
                        Harmonic(order=order, freq_hz=round(target, 3), amplitude=peak)
                    )

    return VideoAnalyzeResponse(
        source="video",
        sample_rate_hz=body.fps,
        duration_s=round(samples.size / body.fps, 3),
        nyquist_hz=nyquist,
        rms=rms,
        crest_factor=crest,
        waveform_t_s=[round(float(t), 4) for t in time_s],
        waveform=[round(float(v), 5) for v in wave],
        spectrum_freq_hz=[round(float(f), 3) for f in freq],
        spectrum=[round(float(a), 6) for a in amp],
        peaks=_peaks(freq, amp),
        shaft_hz_estimate=round(shaft_hz, 3) if shaft_hz is not None else None,
        harmonics=harmonics,
        note=NOTE,
    )
