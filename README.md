# FailureLab AI

FailureLab AI is a Meta-model investigator that finds why a simulated rotating machine
vibrates by designing and running experiments on a physics-based digital twin. A
simulator produces every measurement, a Bayesian engine produces every probability, and a
Meta model chooses experiments, states its predictions before each result and explains the
diagnosis, without ever seeing the true fault. **Investigation and lab data are simulated.** The Real recordings view uses
attributed measurements from a physical laboratory rig; see [Real data](docs/REAL_DATA.md). Built for the Meta Global AI Developer Hackathon 2026
(track: Indie Developer).

Plans: [Product features](docs/PRODUCT_FEATURES.md) ·
[Technical design](docs/TECHNICAL_DESIGN.md) · [Decisions](docs/DECISIONS.md) ·
[Assumptions](docs/ASSUMPTIONS.md) · [API](docs/API.md)

Demo: [Recording guide](docs/DEMO.md) · [Submission draft](docs/SUBMISSION.md) ·
[Verification record](docs/VERIFICATION.md)

Next steps: [Readiness and Meta handoff](docs/READINESS.md).

## Setup

Requires Python 3.11+ (3.12 recommended; CI uses 3.12) and Node 22 LTS with npm.

With make (Linux, macOS, CI):

```sh
make setup PYTHON=python3.12   # backend venv + frontend packages
make backend                   # API on http://127.0.0.1:8000 (docs at /docs)
make frontend                  # dashboard on http://localhost:5173, proxies /api
make check                     # lint + tests + build
```

Without make (e.g. Windows), the same commands via Python:

```sh
python3.12 scripts/tasks.py setup
python scripts/tasks.py backend
python scripts/tasks.py frontend
python scripts/tasks.py check
```

For a single-process demo using the production build:

```sh
python scripts/tasks.py build
python scripts/tasks.py serve
```

Open http://127.0.0.1:8000. The dashboard and API share one origin; Node is only
needed to build the frontend. See [Deployment](docs/DEPLOYMENT.md) for hosting setup.

A live, step-by-step investigation stream is available via
`GET /api/investigations/stream?case_id=<id>&planner=<planner>&seed=<n>` (text/event-stream);
the dashboard opens it automatically when you investigate a case. All streamed data is
simulated and labelled as such.

On Windows, Python 3.12 can be installed with the Python install manager
(`pymanager install 3.12`), which provides `python3.12`.

Model access is optional for development. To enable the Meta model investigator, copy
`backend/.env.example` to `backend/.env` (git-ignored) and fill in the `FAILURELAB_LLM_*`
values from a Meta Model API project at dev.meta.ai: model `muse-spark-1.3`, base URL
`https://api.meta.ai/v1` and your API key. Never commit keys.

## Built during the hackathon (26 Oct – 4 Nov 2026)

All code in this repository was written from scratch during the event. Work started on
28 Oct 2026; the first commit was made on 30 Oct 2026 (see D-34 in `docs/DECISIONS.md`).

### 28 Oct 2026

- Plan review; specs converted to Markdown (`docs/`) with resolutions recorded in
  `docs/DECISIONS.md`.
- Workspace skeleton: backend and frontend folders, Makefile, `scripts/tasks.py`, CI.
- Backend: FastAPI app factory, settings from `backend/.env` (`FAILURELAB_` prefix),
  `GET /api/health`, health tests.
- Frontend: Vite + React + TypeScript + Tailwind page that calls `/api/health` through the
  Vite proxy and shows a visible "Simulated" label, with tests.

### 30 Oct 2026

- First commit (skeleton).
- Physics simulator (`app/physics/model.py`): vectorised Jeffcott-rotor response (1x, 2x,
  broadband, bearing temperature rise), seeded noisy measurement with least-squares feature
  extraction, alarm RMS, spectrum and waveform preview. Tests check each fault's signature,
  determinism, extraction accuracy and the stated noise spread.
- Six sealed cases, public `CaseView` and a seeded generator for benchmark cases
  (`app/cases.py`); `make_runner` as the only bridge to hidden truth (`app/runner.py`).
- Architecture test that fails on forbidden imports.
- Bayesian engine (`app/inference/engine.py`): 990-particle grid over six hypotheses,
  log-space updates for experiments and the alarm, vectorised expected information gain,
  candidate ranking by information per cost, per-hypothesis predictions. Tests cover the
  grid, priors, posterior normalisation, each hypothesis winning on clean evidence,
  non-negative and seeded information gain, ranking rules and speed.
- Rule planners `info_gain`, `sweep`, `random` (`app/agent/planners.py`) and the
  investigation loop (`app/agent/investigate.py`): prior, alarm, predictions recorded before
  each run, posterior updates, stopping at 90% or budget, diagnosis with doubts and a
  recommended check, and a JSON trace. Tests cover budget, repeats, sweep order, seeded
  bit-identical traces, no hidden values in traces, sealed-case accuracy and speed.
- API (`app/api/`, `app/schemas/`): `/api/ready`, `/api/cases`, `/api/experiments`,
  `/api/lab/simulate`, `/api/investigations` (run, save, list, load) with closed request
  schemas, replay storage with id checks, and a clear 503 for an unconfigured Meta model.
  Tests cover 422/404/400/503 paths, public fields only, no hidden values and the replay
  round trip. Reference in `docs/API.md`.
- Meta model investigator (`app/agent/meta_planner.py`, `app/agent/llm_client.py`): the
  model turns the note into a prior (floored at 5%), picks one of the engine's top five
  experiments with a rationale and an expected reading per hypothesis, and writes the
  explanation. Output is parsed defensively and capped; any failure falls back to
  `info_gain` and is logged in `llm_events` with the raw response, so replays are identical.
  Tests use a fake model (valid and invalid output, timeouts, prompt leakage, note
  injection, replay identity) and a mocked HTTP transport; a live smoke test runs only when
  `backend/.env` configures the model.
- Benchmark (`backend/scripts/benchmark.py`, `GET /api/benchmark`): rule planners on six
  sealed cases × 5 seeds plus 120 generated cases; `--planner meta` runs separately with a
  response cache and a call limit. Results in `backend/results/benchmark.json`.
- Dashboard player (`frontend/src/`): typed API client, case picker with investigator and
  seed choice and saved replays, and a step player (play, pause, back, forward, skip) that
  shows each experiment's choice and reasoning, then predictions, then the measurement and
  spectrum, then updated probabilities, with budget, experiment log and a final diagnosis
  card. Tests cover frame order, hidden-until-revealed measurements, diagnosis only at the
  end, numeric probabilities, auto-play and the case picker.
- Manual lab (`frontend/src/lab/ManualLab.tsx`): fault, speed and load sliders on the public
  preset machine with debounced simulation, live readings, a simulator-computed response
  curve, spectrum and waveform. Tests cover the request, debouncing and errors.
- 3D digital twin (`frontend/src/twin/`): shaft, bearings and load arrow in React Three
  Fiber, lazy-loaded. Spin follows RPM (20× slower, labelled), whirl follows measured 1x
  (1,000× exaggeration, stated), strong 2x draws a figure-eight, broadband adds seeded
  jitter, bearing tint follows temperature rise. Before any measurement it shows no whirl.
  Tests target the mapping functions; WebGL rendering itself is not tested.
- Benchmark screen (`frontend/src/benchmark/BenchmarkView.tsx`) with a case-group filter,
  and curated demo replays in `backend/replays/demo/` created by
  `backend/scripts/demo_replays.py`; a test re-runs every demo replay and checks it is
  identical (Meta replays through the recorded model responses).
- Hardening after an independent code review and a headless-browser check of every screen
  in light, dark and phone layouts: each replay id listed once, atomic replay writes,
  unreadable replays skipped (404 instead of 500), unique Meta ids within the same second,
  model clients closed after each run, every model-client error falls back, prior overflow
  guarded, one shared serialiser for traces and API responses, and the Meta benchmark now
  also runs `info_gain` on exactly the same runs so the comparison is like for like.
- Meta model confirmed: Muse Spark 1.3 on Meta's Model API (OpenAI-compatible chat
  completions); the adapter sends `max_completion_tokens` and `reasoning_effort` because
  Muse Spark always reasons (D-55).

### 1 Nov 2026

- Reran all three rule benchmarks (450 simulated investigations total); accuracy and cost
  reproduced the earlier results. Runtime was 54.2 s in total.
- Checked 25 browser views: cases, investigation, diagnosis, lab and benchmark at desktop
  and phone sizes in light and dark themes, plus a 320-pixel phone layout. The 3D twin rendered in Chromium; no uncaught
  page errors or page-level horizontal overflow were observed.
- Fixed fractional/out-of-range seed inputs and disabled replay opening while a run loads.
- Made concurrent saves of the same replay id use independent temporary files, with a
  regression test for two simultaneous writers.
- Added baseline demo replays for the other three cases, so all six cases are available.
- Added a recording guide, submission draft and verification record. The final video,
  public repository and live Meta results remain pending.
- Added a single-process production demo command, static-asset/API integration tests and
  deployment instructions. CI now checks Windows as well as Linux.
- Final check: backend 216 passed, 1 live-model test skipped; frontend 45 passed;
  Ruff, ESLint, TypeScript and the production build passed. Optional browser checks use
  Playwright 1.64.1 (Apache-2.0) installed outside the app dependency tree.

## Status

- Done and tested: simulator, Bayesian engine, rule planners, investigation loop, API, Meta
  model investigator (with a fake model), benchmark, dashboard player, manual lab, 3D twin,
  benchmark screen, demo replays.
- Verified on 2 November: live Meta endpoint and a saved Meta investigation on `case-r2`
  (four calls, zero fallbacks, 94.7% simulated misalignment probability).
- Verified: full Meta benchmark (18 simulated investigations, 100% accuracy, zero fallbacks). The 3D scene rendered in browser checks on
  1 November; these checks do not establish physical accuracy or cross-browser support.

To repeat the Meta checks and run the remaining benchmark:

```sh
cd backend && .venv/Scripts/python -m pytest tests/test_llm_client.py   # live smoke test
python scripts/tasks.py benchmark-meta                                   # sealed cases × 3 seeds
cd backend && .venv/Scripts/python scripts/demo_replays.py --planner meta --cases case-t4
```

## Benchmark results (simulated)

Measured again on 1 Nov 2026 with `python scripts/tasks.py benchmark` (150 runs per planner:
6 sealed cases × 5 seeds + 120 generated cases; budget 8 points; stop at 90%). All cases
are simulated with the same model family the engine assumes, so these numbers show the
method works when the model is structurally right, not real-world accuracy.

| Planner | Accuracy | Mean cost (points) | Mean experiments | Reached 90% | Runtime |
|---|---|---|---|---|---|
| `info_gain` | 99.3% | 2.15 | 2.07 | 96.7% | 51.8 s |
| `sweep` | 96.0% | 2.99 | 2.51 | 95.3% | 1.2 s |
| `random` | 98.0% | 3.90 | 2.79 | 94.0% | 1.3 s |

On this simulator every planner usually finds the fault within budget; the clear
difference is cost: `info_gain` needs about 28% fewer points than the fixed sweep and 45%
fewer than random choice. The hardest hypothesis is misalignment (`info_gain` 96%, `sweep`
84%). The live Meta benchmark is reported below.

### Against the targets set before building

Targets from `docs/PRODUCT_FEATURES.md` §6. Numbers from `backend/results/benchmark.json`
and the test suite; "not measured" means exactly that.

| Metric | Target | Measured | Met |
|---|---|---|---|
| Accuracy on 120 unseen simulated cases | ≥ 95% | `info_gain` 99.2%, `sweep` 95.0%, `random` 98.3% | Yes (`info_gain`) |
| Cost, information gain vs fixed sweep | Lower at equal accuracy | 2.15 vs 2.99 points, accuracy 99.3% vs 96.0% | Not established at equal accuracy |
| Cost, Meta model vs information gain on cases with notes | Equal or lower | 1.78 vs 2.33 points on the same 18 sealed runs | Yes on this sample |
| Accuracy when the system says ≥ 90% | ≥ 90% | `info_gain` 99.3%, `sweep` 98.6%, `random` 100% | Yes |
| Meta model fallbacks | < 5% of calls | 0 of 53 calls | Yes on this sample |
| Investigation time without the model | < 2 s | Under 2 s (`test_investigation_is_fast`; `info_gain` on sealed cases 0.1–0.6 s, seed 0) | Yes |
| Rule-planner benchmark run time | < 2 min | 54.2 s for all three planners | Yes |
| Sealed demo cases diagnosed correctly | 6 of 6 | `info_gain` 6 of 6 on all 5 seeds (30 of 30 runs) | Yes (`info_gain`) |

### Dependencies

Direct dependencies, pinned to exact versions:

| Package | Version | Use | License |
|---|---|---|---|
| FastAPI | 0.143.1 | Backend API | MIT |
| Uvicorn | 0.54.0 | ASGI server | BSD-3-Clause |
| Pydantic | 2.14.1 | Schemas and validation | MIT |
| pydantic-settings | 2.16.0 | Settings from `.env` | MIT |
| NumPy | 2.5.4 | Physics and inference | BSD-3-Clause (bundled parts: 0BSD, MIT, Zlib, CC0-1.0) |
| httpx | 0.28.1 | Meta model adapter; test client | BSD-3-Clause |
| setuptools | 84.0.0 | Backend build backend | MIT |
| pytest | 9.1.1 | Backend tests | MIT |
| Ruff | 0.17.0 | Backend lint and format | MIT |
| React, React DOM | 19.3.1 | Frontend UI | MIT |
| Recharts | 3.10.1 | Spectrum and response charts | MIT |
| react-is | 19.3.1 | Peer dependency of Recharts | MIT |
| three | 0.186.1 | 3D twin rendering | MIT |
| @react-three/fiber | 9.8.1 | React renderer for three.js | MIT |
| @types/three | 0.186.0 | three.js type definitions | MIT |
| Vite | 8.3.4 | Frontend dev server and build | MIT |
| @vitejs/plugin-react | 6.1.2 | React support for Vite | MIT |
| TypeScript | 6.0.3 | Frontend language | Apache-2.0 |
| Tailwind CSS | 3.4.19 | Styling | MIT |
| PostCSS | 8.5.30 | CSS processing | MIT |
| Autoprefixer | 10.6.1 | CSS vendor prefixes | MIT |
| Vitest | 5.0.4 | Frontend tests | MIT |
| jsdom | 30.1.2 | DOM for tests | MIT |
| @testing-library/react | 16.3.3 | Component tests | MIT |
| @testing-library/dom | 10.4.2 | Component tests | MIT |
| @testing-library/jest-dom | 7.0.1 | DOM matchers | MIT |
| ESLint | 10.12.0 | Frontend lint | MIT |
| @eslint/js | 10.0.1 | ESLint rules | MIT |
| typescript-eslint | 8.71.2 | TypeScript lint | MIT |
| eslint-plugin-react-hooks | 7.1.1 | React hooks lint | MIT |
| eslint-plugin-react-refresh | 0.5.7 | Vite fast-refresh lint | MIT |
| globals | 17.13.0 | ESLint globals | MIT |
| @types/react, @types/react-dom | 19.3.0 | React type definitions | MIT |
| GitHub Actions (checkout, setup-python, setup-node) | v5 / v6 / v5 | CI | MIT |

Transitive dependencies are under compatible licenses: permissive (MIT, BSD, Apache-2.0,
ISC), MPL-2.0 used unmodified (e.g. certifi), and CC-BY-4.0 data (caniuse-lite). No GPL or
AGPL code is used.

## License

MIT — see [LICENSE](LICENSE).

## Live Meta benchmark ? 2 November 2026

Muse Spark 1.3 (`muse-spark-1.3`) completed six sealed simulated cases with three
seeds each (18 investigations), using 53 new API calls in 242.69 seconds, with
zero fallbacks. Both planners below ran on exactly the same cases and seeds.

| Planner | Accuracy | Mean experiment cost | Mean experiments | Reached 90% |
|---|---|---|---|---|
| Meta | 100% | 1.7778 | 1.6111 | 100% |
| Information gain, same runs | 100% | 2.3333 | 2.2778 | 94.44% |

Meta used about 23.8% fewer experiment points on this small sealed-case sample.
Experiment cost measures simulated experiment budget, not API billing or latency.
This result does not establish real-world accuracy or generalisation to unseen
machines. Source: `backend/results/benchmark.json`.

## Auditable proof of concept

The [paired challenge](docs/PROOF_OF_CONCEPT.md) tests 24 newly generated simulated
machines with absent, misleading and adversarial maintenance notes. Run
`python scripts/tasks.py proof`; inspect the evidence panel on the Benchmark screen.
The frozen plan, per-run results and raw model replies make the experiment auditable.
Offline verification reproduces recorded investigations without API calls.

Built on 2 November 2026: frozen paired challenge, checkpoint/resume, uncertainty
intervals, downloadable model evidence and per-machine dashboard audit. No new
dependencies were added.

Measured challenge result: Meta and baseline each achieved 23/24 correct diagnoses
(95.8%) in every note condition; Meta had zero fallbacks across 273 recorded stages
and 209 new API calls. No experiment-cost advantage was established on these new
machines. The earlier 23.8% saving applies to the original sealed-case sample only.
See the proof document for uncertainty, latency and the retained failure case.

## Real machine examples

Open `http://127.0.0.1:8000/?view=real` to inspect genuine four-channel accelerometer
recordings and the source authors' photograph of the physical rotor test rig.
The [real-data study](docs/REAL_DATA.md) uses 12 labelled reference trials and eight
separate held-out trials. Meta and a reference-distance baseline each scored 6/8;
this small single-rig sample does not establish industrial reliability.

Built on 2 November 2026: licensed real-signal downloader, measured-feature analysis,
held-out Meta sensor inspection, source-label reveal and a Real recordings dashboard.
Dataset and photograph: Brito, Susto, Brito and Duarte (2022),
DOI 10.17632/zx8pfhdtnb.1, CC BY 4.0. Original signal analysis code; no new software
dependencies. See REAL_DATA.md for attribution, modifications and reproduction.
