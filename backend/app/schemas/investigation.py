"""Investigation request and the replayable trace (TECHNICAL_DESIGN.md §8)."""

from typing import Any, Literal

from pydantic import Field

from app.schemas.simulation import CaseOut, Closed

PlannerName = Literal["meta", "info_gain", "sweep", "random"]
INVESTIGATION_ID_PATTERN = r"^[a-z0-9_-]{1,80}$"
Probabilities = dict[str, float]


class InvestigationRequest(Closed):
    case_id: str = Field(min_length=1, max_length=64)
    planner: PlannerName = "meta"
    seed: int = Field(default=0, ge=0, le=10_000)


class Prior(Closed):
    probabilities: Probabilities
    reason: str


class Alarm(Closed):
    rpm: float
    load_n: float
    overall_rms_um: float
    posterior: Probabilities


class Prediction(Closed):
    amp_1x_um: float
    amp_2x_um: float
    temp_rise_c: float


class Measured(Closed):
    amp_1x_um: float
    amp_2x_um: float
    broadband_um: float
    temp_rise_c: float


class Signals(Closed):
    time_s: list[float]
    displacement_um: list[float]
    spectrum_freq_hz: list[float]
    spectrum_amp_um: list[float]


class Step(Closed):
    index: int
    rpm: float
    load_n: float
    cost: int
    chosen_by: str
    rationale: str
    information_bits: float | None
    expectations: dict[str, str] | None
    predictions: dict[str, Prediction]
    measured: Measured
    signals: Signals
    posterior: Probabilities
    budget_remaining: int


class Ranked(Closed):
    hypothesis: str
    probability: float


class Diagnosis(Closed):
    top: str
    probability: float
    confident: bool
    ranked: list[Ranked]
    remaining_doubts: list[Ranked]
    recommended_check: str
    explanation: str


class Trace(Closed):
    investigation_id: str = Field(pattern=INVESTIGATION_ID_PATTERN)
    case: CaseOut
    planner: PlannerName
    seed: int
    source: Literal["simulation"]
    model_version: str
    prior: Prior
    alarm: Alarm
    steps: list[Step]
    experiments: int
    cost: int
    budget: int
    stop_reason: Literal["confident", "budget", "no_affordable_experiment"]
    diagnosis: Diagnosis
    llm_events: list[dict[str, Any]]


class TraceSummary(Closed):
    investigation_id: str
    case_id: str
    planner: PlannerName
    seed: int
    top: str
    probability: float
    experiments: int
    cost: int
    demo: bool


class Ready(Closed):
    status: Literal["ok"]
    physics_model_version: str
    meta_model_configured: bool
    meta_model: str


class QuestionRequest(Closed):
    """An engineer's question about a finished investigation (D-75)."""

    question: str = Field(min_length=3, max_length=300)


class Answer(Closed):
    """The Meta model's answer, grounded in the saved trace. Never stored in the trace."""

    investigation_id: str
    question: str
    answer: str
    model: str
    ok: bool
    fallback: bool
    usage: dict[str, int] | None
    error_kind: str | None = None
    error: str | None = None
    source: Literal["simulation"] = "simulation"
