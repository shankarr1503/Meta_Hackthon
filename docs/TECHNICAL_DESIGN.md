# FailureLab AI — Technical Design Document

28 Oct 2026 · Meta Global AI Developer Hackathon 2026

How FailureLab AI will be built, from scratch, between 28 October and 4 November 2026.
Everything here is a design to implement; results are targets until measured during the
event. Converted from the original PDF plan, with the resolutions in
[DECISIONS.md](DECISIONS.md) applied.

## 1. Principles

1. **The simulator is the only source of numbers.** Every measurement comes from a
   simulation run, never from the language model.
2. **The Bayesian engine is the only source of probabilities.** The model can influence
   where to look and what to believe at the start, never the scoring.
3. **The Meta model is the investigator.** It reads context, chooses experiments, commits to
   predictions and explains results. Rule-based planners exist as fallback and as baselines
   to beat.
4. **The answer is unreachable.** The true fault lives in one module and reaches the
   investigation only through a function that runs experiments.
5. **Everything repeats.** All randomness is seeded; every investigation is saved and replays
   identically. Rule planners are bit-identical for the same case and seed; Meta runs record
   every model response so their replays are identical, but a new Meta run may differ.
6. **Honest labelling.** All data is simulated and every screen and response says so.
7. **Small and boring infrastructure.** One backend, one frontend, files for storage, no
   microservices.

## 2. Architecture

One Python backend owns all physics, inference and planning; one React frontend only
displays results.

The investigation loop asks the Meta model planner for each experiment. If the model fails
or returns invalid output, the information-gain planner answers instead and the event is
logged. The loop never holds a hidden case, only a function that runs experiments on one.

### Components

| Component | Responsibility | Code |
|---|---|---|
| Simulator | Rotor response, temperature, sensor signal, feature extraction | `backend/app/physics/model.py` |
| Case store | Six sealed cases and a random case generator | `backend/app/cases.py` |
| Runner | Wraps a hidden case in `run(rpm, load, i)` | `backend/app/runner.py` |
| Bayesian engine | Posterior over hypotheses; expected information gain; predictions | `backend/app/inference/engine.py` |
| Rule planners | Information gain, fixed sweep, random | `backend/app/agent/planners.py` |
| Meta model planner | Note to prior; choose among top candidates with predictions; explain | `backend/app/agent/meta_planner.py` |
| Model adapter | One `complete(system, user)` interface over the hackathon endpoint | `backend/app/agent/llm_client.py` |
| Investigation loop | Alarm, experiments, stopping, diagnosis, trace | `backend/app/agent/investigate.py` |
| API | Routes, validation, replay storage | `backend/app/api/` |
| Schemas | Pydantic request and response models (closed) | `backend/app/schemas/` |
| Measured recordings | Features and plot previews from attributed lab recordings; no simulator or priors | `backend/app/measured.py` |
| Video vibrometry | Spectrum from a client-extracted motion series; Meta reading of derived features | `backend/app/api/video.py` |
| Dashboard | Case picker, investigation player, lab, benchmark, real recordings, video intake, ask panel | `frontend/src/` |
| 3D twin | Shaft and bearings driven by measurements | `frontend/src/twin/` |

### Dependency rules

1. `physics` imports nothing else from the app.
2. `inference` imports only `physics`.
3. `agent` imports `inference` and `physics`, and receives a public `CaseView` plus a
   callable, never a hidden `Scenario`.
4. Only `runner.py` and the API read `Scenario` objects.
5. The frontend talks only to `/api`; keys never leave the backend.

## 3. Investigation flow

1. **Start.** The API looks up the hidden case, builds `run` for it, and passes the loop only the
   public `CaseView`.
2. **Prior.** The Meta model turns the maintenance note into starting probabilities, each at
   least 5%.
3. **Alarm.** One free reading at 2,950 RPM and 500 N; only the overall level is kept.
4. **Choose.** The engine ranks untried, affordable candidates by expected information per
   cost; the model picks one of the top five and states what each hypothesis should show.
5. **Predict.** The loop records each hypothesis's predicted 1x, 2x and temperature rise before
   running.
6. **Run.** The simulator returns noisy features from the hidden machine.
7. **Update.** The engine recomputes probabilities.
8. **Stop or repeat** at 90% confidence or when no affordable experiment remains.
9. **Diagnose and explain.** Top fault, probability, remaining doubts, recommended check;
   the model writes the explanation from the evidence.
10. **Save.** The trace is written to `backend/replays/` and returned.

## 4. Engineering layers

The demo is the visible tip; these ten layers keep it afloat. Each has a concrete rule and a
check.

| Layer | Rule for FailureLab | How it is checked |
|---|---|---|
| System design | One job per component (section 2) | Code review against the component table |
| Data structures & algorithms | 990-particle grid; log-space updates; vectorised information gain | Speed test; engine unit tests |
| Debugging | All randomness seeded; every run saved as a trace | Reproducibility test |
| Testing | Every feature ships with tests | `make check` before every commit; CI |
| Scalability | Investigation under 2 s without model; rule-planner benchmark under 2 min | Timed tests |
| Security | Closed schemas; hidden truth isolated; model output validated; keys backend-only | Leakage and schema tests |
| DevOps | One-command setup; CI on every push | CI green on main |
| Clean code | Type hints; small functions; lint clean | Ruff and ESLint in CI |
| Architecture | Dependency rules in section 2 | Import test that fails on forbidden imports |
| Maintenance | README, assumptions register and decision log kept current | Definition of done |

## 5. Physics model

A single-mass, Jeffcott-style rotor in steady state: simple enough that every behaviour
can be explained in a sentence and checked by a test.

| Quantity | Formula |
|---|---|
| Speed ratio | `r = rpm / wn`, `wn` = first critical speed (RPM) |
| Damping | `ζ = 0.03 + 0.08 · friction` |
| Stiffness | `k = M · (2π · wn / 60)²`, `M = 10 kg` |
| Dynamic factor | `D(x) = √((1 − x²)² + (2ζx)²)` |
| Imbalance | `m·e = 1e-5 + 2e-4 · imbalance` (kg·m); `x1 = (m·e / M) · r² / D(r)`; `x2 = 0.20 · x1` |
| Misalignment | `F = 30 · misalignment · (1 + load/1500)` (N); `x2 = (F/k) / D(2r)`; `x1 = 0.6 · (F/k) / D(r)` |
| Amplitudes | `A1`, `A2` = sums of `x1`, `x2` contributions (µm) |
| Broadband | `B = √((6 · friction · rpm/3000)² + 2²)` (µm RMS) |
| Temperature rise | `T = thermal · [8s(1 + load/2000) + 30·friction·s(1 + load/1000) + 6·misalignment(1 + load/1500)]`, `s = rpm/3000` |

`T` is the bearing temperature rise above ambient, in °C. Ambient is not modelled.

**Measurement.** Multiply A1 and A2 by random factors (log spread 0.35), friction broadband
by 0.20 and temperature by 0.10, plus 1.5 °C noise. Build 1 s of signal at 5 kHz with 2 µm
sensor noise. Extract 1x and 2x by least-squares sinusoid fitting; broadband is the residual
spread. The alarm keeps only overall RMS: `√((A1² + A2²)/2 + B²)`.

**Hidden machine values.** Each case has a critical speed of 3,300–3,900 RPM and a thermal
factor of 0.7–1.4 that the investigator does not know.

| Fault | Speed | Load | Spectrum | Temperature |
|---|---|---|---|---|
| Imbalance | 1x grows with speed², peaks at critical speed | No effect | 1x dominant | Unchanged |
| Misalignment | 2x peaks near half the critical speed | Grows with load | Strong 2x | Small rise |
| Bearing friction | Lowers resonance peaks | Heat grows with load | Raised broadband | Large rise |
| Healthy | Small residual 1x | No effect | Near noise floor | Baseline |

**Assumptions to state openly:** one mode only; viscous damping; amplitudes add in phase;
steady-state temperature; white-noise broadband; ideal sensors; random rather than
systematic model error. Full register in `docs/ASSUMPTIONS.md`.

## 6. Inference engine

**Hypotheses:** healthy, imbalance, misalignment, bearing friction, imbalance + friction,
imbalance + misalignment.

**Particles.** Each hypothesis is a grid of unknowns: severities 0.15, 0.3, 0.5, 0.75, 1.0 (a 5 × 5
grid for combined faults) × critical speeds 3,300–3,900 RPM in steps of 150 × thermal
factors 0.75, 1.0, 1.3. That gives 15 particles for healthy, 75 for each single fault and 375 for
each combined fault: 990 in total. Each particle's prior weight is its hypothesis's prior
divided by the hypothesis's particle count. Hidden thermal values are off-grid on purpose;
if sealed-case accuracy misses the target, widen the grid to (0.7, 1.0, 1.4) and record it in
DECISIONS.md.

**Likelihood.** Features are log(1 + 1x), log(1 + 2x), log(broadband) and temperature rise,
each compared with every particle's prediction under a Gaussian error model.

| Feature | Error spread |
|---|---|
| log 1x, log 2x | 0.354 |
| log broadband | 0.206 |
| Temperature rise | `√(1.5² + (0.1 · T)²)` °C |
| Alarm: log overall RMS | 0.354 |

Weights accumulate in log space; a hypothesis's probability is the sum of its particles'
normalised weights.

**Expected information gain.** For a candidate experiment: draw 64 particles by weight,
simulate a noisy measurement for each using feature-level noise only (no waveforms),
compute the resulting posterior's entropy, and subtract the average from the current
entropy. Fully vectorised over particles.

**Candidates and stopping.** 8 speeds (900–5,100 RPM, step 600) × 3 loads (0, 1,000, 2,000
N). Cost 1 point, 2 above 4,000 RPM; budget 8; no repeats. Stop at 90% or when nothing
affordable remains. Every planner shares these rules.

**Limitation.** The engine assumes the simulator's model family. Results show the method
works when the model is structurally right, not robustness to unmodelled physics.

## 7. Planners and the Meta model investigator

```python
class Planner(Protocol):
    name: str
    def prior(self, case: CaseView) -> tuple[dict[str, float] | None, str]: ...
    def choose(self, belief, remaining, done, rng) -> dict | None: ...
    def explain(self, trace: dict) -> str: ...
```

| Planner | Role | Prior | Chooses by |
|---|---|---|---|
| `meta` | Main investigator | From the maintenance note | Picks one of the top 5 by information per cost, with stated predictions |
| `info_gain` | Fallback and baseline | Uniform | Best information per cost |
| `sweep` | Baseline: an engineer's fixed plan | Uniform | (1500,0) (3300,0) (4500,0) (1500,2000) (3300,2000) (4500,2000) (900,1000) (2700,1000) (3900,1000) (5100,1000), in order, skipping any point it cannot afford; stops when nothing affordable remains |
| `random` | Baseline: proves choices are informed | Uniform | Any affordable untried candidate |

### The Meta model's three jobs

| Job | Output (JSON) | Validation | Fallback |
|---|---|---|---|
| Read the note | `priors` per hypothesis, `reasoning` | Non-negative; renormalised; then `p = 0.05 + 0.7 · p_normalised` (minimum exactly 5%, sum exactly 1) | Uniform prior |
| Choose the experiment | `choice` index, `rationale`, `expected` per hypothesis | Index in range; unknown names dropped; text capped | Top information-gain candidate |
| Explain | `explanation`, 120 words max | Text only; capped at 1,200 characters | Template explanation |

**Prompt rules.** System prompt: diagnostics engineer, simulated rig, JSON only.
Temperature 0.2. Prompts say notes can mislead. Prompts are built only from the case
view, probabilities, candidates and trace, never hidden values.

**Adapter.** `llm_client.py` exposes `complete(system, user) -> str` with a 60-second
timeout (D-55). The provider, endpoint, model name and key come from `backend/.env`
(`FAILURELAB_LLM_*`). The confirmed model is Muse Spark 1.3 (`muse-spark-1.3`) behind an
OpenAI-compatible chat-completions endpoint. Only this file changes if the format differs.

**Not configured vs failing.** If the model is not configured, `POST /api/investigations` with
planner `meta` returns 503 explaining how to configure it or use `info_gain`. If it is
configured, any per-call failure during a run (timeout, HTTP error, invalid JSON,
out-of-range choice) falls back to `info_gain` for that call and is logged in the trace's
`llm_events`, so the demo and benchmark show exactly how often the fallback was used.

## 8. API and data models

All endpoints under `/api`, JSON only, documented automatically at `/docs` and in
`docs/API.md`.

| Method | Path | Purpose | Errors |
|---|---|---|---|
| GET | `/api/health` | `{status, service, version, contract_version: "1"}` | — |
| GET | `/api/ready` | Status of physics engine and Meta model adapter | — |
| GET | `/api/cases` | Public case fields only | — |
| GET | `/api/cases/{case_id}` | Public fields of one sealed case or fresh machine `fresh-<seed>` (D-74) | 404 |
| POST | `/api/experiments` | One simulated experiment on a case: features, waveform, spectrum | 404, 422 |
| POST | `/api/lab/simulate` | One simulated experiment on the public preset lab machine | 422 |
| POST | `/api/investigations` | Run and save an investigation | 403, 404, 422, 429, 503 |
| GET | `/api/investigations/stream` | Run an investigation live as Server-Sent Events | 403, 404, 422, 429, 503 |
| GET | `/api/investigations` | List saved replays | — |
| GET | `/api/investigations/{id}` | Load a replay | 400, 404 |
| POST | `/api/investigations/{id}/ask` | Meta model answers a question from the saved trace's evidence (D-75) | 400, 403, 404, 422, 429, 503 |
| GET | `/api/benchmark` | Latest benchmark results | 404 if not yet run |
| GET | `/api/proof/download` | Proof challenge evidence as a JSON attachment | 404 |
| GET | `/api/real-recordings` | Measured laboratory recordings report (closed schema) | 404, 503 |
| GET | `/api/real-recordings/photo` | Source test-rig photograph (CC BY 4.0) | 404 |
| POST | `/api/video/analyze` | Spectrum from a client-extracted motion series (experimental) | 422 |
| POST | `/api/video/assess` | Meta reading of video-extracted features (experimental) | 403, 422, 429, 503 |

**Case view** (`/api/cases`): exactly `case_id`, `title`, `note`, `initial_rpm` (2950),
`initial_load_n` (500).

**ExperimentRequest** (extra keys rejected with 422): `case_id` (1–64 chars), `rpm` (0–6,000),
`load_n` (0–5,000, default 0), `duration_s` (0–10, default 1), `sample_rate_hz` (500–50,000,
default 5,000), `seed` (≥ 0, default 0).

**Experiment response:** `amp_1x_um`, `amp_2x_um`, `broadband_um`, `temp_rise_c`,
`time_s` + `displacement_um` (first 0.2 s, at most 400 points), `spectrum_freq_hz` +
`spectrum_amp_um` (to 200 Hz), `source: "simulation"`, `model_version`. A test checks that
hidden values never appear in it.

**LabRequest** (extra keys rejected with 422): `imbalance`, `misalignment`, `friction`, `rpm`,
`load_n`, `seed`. It simulates a public preset machine (critical speed 3,600 RPM, thermal
factor 1.0), not a sealed case, so it reveals no hidden truth. Response: the experiment
response fields with `source: "simulation"` and `kind: "lab"`.

**InvestigationRequest:** `case_id`; `planner` one of `meta`, `info_gain`, `sweep`, `random`
(default `meta`); `seed` 0–10,000.

**QuestionRequest** (extra keys rejected with 422): `question` (3–300 chars). The answer
(`Answer`: `question`, `answer` ≤ 900 chars, `model`, `ok`, `fallback`, `usage`,
`error_kind`, `error`, `source`) is returned and never written into the trace; the model
sees only the question and the public trace fields (D-75).

**Investigation ids:** rule planners `{case_id}-{planner}-{seed}`; Meta
`{case_id}-meta-{seed}-{YYYYMMDDhhmmss}`. Both match `^[a-z0-9_-]{1,80}$`.

**Trace:** investigation id, case, planner, seed, `source: "simulation"`, model version; prior
and its reason; steps (operating point, cost, measurements, per-hypothesis predictions
made before the run, posterior, `chosen_by`, rationale, information gain, model
expectations); experiments, cost, budget; diagnosis (top, probability, confident, ranked,
remaining doubts, recommended check, explanation); `llm_events` (including every raw model
response, so Meta replays are identical).

## 9. Frontend

| Screen | Purpose |
|---|---|
| Case picker | Six case cards with notes; planner choice; saved replays |
| Investigation | Step-by-step player: probability bars, budget, experiment log, prediction versus result, twin, diagnosis |
| Manual lab | Fault, speed and load controls on the public preset machine with live readings and response curve |
| Benchmark | Planner comparison from `/api/benchmark` |

**Step player.** Live runs and replays use one player: show the chosen experiment and the
model's reasoning, then its predictions, then reveal the measurement, then animate
probabilities. Controls: play, pause, step forward and back.

**3D twin mapping.** Shaft spin follows RPM (slowed, with true RPM labelled); whirl orbit
size follows measured 1x with a stated exaggeration factor; a strong 2x turns the orbit into
a figure-eight; broadband adds seeded jitter; bearing tint follows temperature rise; an
arrow shows load. The twin never shows motion the measurements do not support. Tests
target the mapping functions, not WebGL rendering.

| Folder | Contents |
|---|---|
| `frontend/src/api/` | `client.ts`, `types.ts` |
| `frontend/src/state/` | `useInvestigation.ts` |
| `frontend/src/dashboard/` | CasePicker, ProbabilityBars, BudgetMeter, ExperimentLog, ExperimentCard, PredictionTable (prediction check), SpectrumChart, DiagnosisCard, ActionPlan, AskPanel, PlayerControls, LiveInvestigationView; `src/state/live.ts` reduces live frames; `src/ErrorBoundary.tsx` isolates each view |
| `frontend/src/twin/` | ShaftScene, Shaft, Bearing, LoadArrow |
| `frontend/src/lab/` | ManualLab |
| `frontend/src/benchmark/` | BenchmarkView, ProofPanel |
| `frontend/src/real/` | RealRecordings |
| `frontend/src/video/` | VideoIntake |

**Visual rules.** A visible "Simulated" label on every result view; probabilities always shown
as numbers; light and dark themes; keyboard-operable controls; text summaries for
charts.

## 10. Security and ground-truth isolation

| Layer | Mechanism | Test |
|---|---|---|
| Storage | True fault and hidden values only in `Scenario` objects in `cases.py` | Import test |
| Execution | Loop receives a `CaseView` and `run` callable only | Trace leakage test |
| Requests | All request models forbid extra keys; no label fields on case requests | 422 tests |
| Responses | `/api/cases` returns exactly five public fields; experiment responses carry no hidden values | Field tests |
| Lab | `/api/lab/simulate` uses a public preset machine, never a sealed case | Lab isolation test |
| Prompts | Built from public data only | Prompt leakage test |
| Benchmark | Reads labels only to score, outside `app/` | Import test |

**Secrets.** Keys only in `backend/.env` (git-ignored); `.env.example` holds blanks; keys held
as secret strings and never returned; the browser reaches only the backend.

**Inputs and outputs.** Bounded request fields; replay ids must match `^[a-z0-9_-]{1,80}$`;
model output parsed defensively, capped and validated; CORS limited to the frontend
origin.

Prompt injection through notes can at most shift the prior (floored at 5% per hypothesis)
or pick among vetted candidates. It cannot change measurements, scoring or stopping.

## 11. Testing and benchmark

| Suite | What it proves |
|---|---|
| Physics | Each fault's signature; seeded determinism; feature extraction accuracy |
| Engine | Posterior sums to 1; correct hypothesis wins on clean evidence; information gain is non-negative; speed |
| Planners | Budget respected; no repeats; sweep skips unaffordable points; bit-identical traces for the same case and seed |
| Meta planner | Valid output used; invalid, missing or slow output falls back and is logged; prior floor exact; prompts free of hidden values (fake model in tests); replay of a Meta trace is identical |
| API | Schemas, 422 and 404 paths, public fields only, no hidden values in experiment responses, replay round trip, path safety, clear 503 |
| Architecture | Forbidden imports fail the build |
| Frontend | Player stepping; bars show numbers; measurements hidden until revealed; diagnosis only at the end; twin mapping functions |
| Live model | Smoke test against the real endpoint, skipped when no key is set |

**Benchmark protocol.** Six sealed cases × 5 seeds, plus 120 random cases (20 per
hypothesis, severities 0.15–0.8, off-grid hidden values). Planners `info_gain`, `sweep` and
`random` run together with the same budget and stopping rule; this run has the under-2-minute
target, enforced by `RULE_BUDGET_S` in `scripts/benchmark.py` (the run exits 1 past it)
and by a suite test on the committed `runtime_s` values. `meta` runs as a separate
command, `scripts/benchmark.py --planner meta`, starting with
the sealed cases × 3 seeds, with response caching and a configurable call limit. Metrics:
accuracy, mean experiments, mean cost, share reaching 90%, accuracy when 90% sure, model
fallback rate. Output to `backend/results/benchmark.json`, committed with the code that
produced it. Report every number as measured, including failures.

### Sealed cases

| case_id | Title | Note | Truth | wn (RPM) | Thermal |
|---|---|---|---|---|---|
| case-k7 | Pump drive A | During cleaning, a small balance weight was found loose inside the guard. | imbalance 0.30 | 3550 | 1.25 |
| case-r2 | Conveyor gearbox input | Vibration started after the motor was re-mounted on a new base plate. | misalignment 0.35 | 3720 | 0.80 |
| case-m9 | Blower shaft | A lubrication interval was missed; the bearing housing feels warm to the touch. | friction 0.30 | 3400 | 0.80 |
| case-t4 | Mixer spindle | Vibration has crept up over months and the housing runs warmer than its twin machine. | imbalance 0.40 + friction 0.25 | 3650 | 1.20 |
| case-b6 | Compressor coupling | The coupling was replaced and the rotor had a minor weld repair in the same outage. | imbalance 0.35 + misalignment 0.25 | 3480 | 1.00 |
| case-x1 | Test-bench motor | An operator says it "sounds different" at full speed. Nothing was serviced recently. | healthy | 3800 | 1.35 |

The truth, wn and thermal columns live only in `cases.py`. They are listed here because the
repo is public and the planning is open; the investigator and API never see them.

**Definition of done.** Tests written and passing; `make check` green; CI green; assumptions
and decisions updated; README "Built during the hackathon" updated; no claim the tests
do not support.

## 12. Repository, tooling and DevOps

```
failurelab-ai/
  CLAUDE.md                 standing rules for Claude Code
  README.md                 setup, "Built during the hackathon", licenses
  LICENSE                   MIT
  Makefile                  setup, backend, frontend, test, lint, check
  scripts/tasks.py          same commands for machines without make
  .github/workflows/ci.yml
  docs/                     PRODUCT_FEATURES.md, TECHNICAL_DESIGN.md,
                            ASSUMPTIONS.md, DECISIONS.md, API.md, REAL_DATA.md,
                            PROOF_OF_CONCEPT.md, VERIFICATION.md, DEMO.md,
                            DEPLOYMENT.md, SUBMISSION.md, READINESS.md,
                            THIRD_PARTY_LICENSES.md
  backend/
    app/  physics/ inference/ agent/ api/ schemas/
          cases.py runner.py config.py measured.py main.py
    scripts/                benchmark.py proof.py real_examples.py
                            fetch_real.py second_rig_check.py demo_replays.py
                            ask_audit.py
    results/ replays/ (replays/demo/ committed) tests/ data/real/
    pyproject.toml .env.example
  frontend/                 Vite + React + TypeScript + Tailwind
    src/  api/ state/ dashboard/ twin/ lab/ benchmark/ real/ video/
```

| Tool | Use | License |
|---|---|---|
| Python 3.11+ (3.12 in CI), FastAPI, Pydantic, Uvicorn | Backend and API | MIT / BSD |
| NumPy | Physics and inference | BSD |
| httpx | Meta model adapter | BSD |
| pytest, Ruff | Tests and lint | MIT |
| Node 22 LTS, npm | Frontend toolchain | MIT |
| React, Vite, TypeScript, Tailwind | Frontend | MIT / Apache-2.0 |
| Recharts, Three.js, React Three Fiber | Charts and 3D | MIT |
| Vitest, Testing Library, ESLint | Frontend tests and lint | MIT |
| GitHub Actions | CI on every push | — |

Allowed licenses: MIT, BSD, Apache-2.0, ISC; MPL-2.0 used unmodified (e.g. certifi);
CC-BY-4.0 data (caniuse-lite); OFL fonts (Google Fonts). Not allowed: GPL, AGPL, or anything
without a license. Verify each license when adding a dependency and record direct
dependencies in the README.

**Commands.** `make setup`, `make backend` (port 8000), `make frontend` (port 5173, proxies
`/api`), `make test`, `make lint`, `make check` (lint + tests + build). Without make, use
`python scripts/tasks.py <command>`. The Makefile detects the venv's `bin/` or `Scripts/`
folder. `main` always passes `make check`; commit after each green step.

## 13. Build schedule

| Day | Work |
|---|---|
| Wed 28 Oct | Foundation + physics |
| Thu 29 Oct | Engine, planners, API |
| Fri 30 Oct | Meta model investigator |
| Sat 31 Oct | Dashboard player |
| Sun 1 Nov | Evidence panels + manual lab |
| Mon 2 Nov | 3D twin + benchmarks |
| Tue 3 Nov | Hardening + demo video |
| Wed 4 Nov | Submit before 9:00 PM ET |

If a day slips, cut in this order: live streaming, benchmark screen, 3D twin, manual lab.
Never cut the Meta model investigator, the replay player or the demo video.

## 14. Decisions

See [DECISIONS.md](DECISIONS.md).
