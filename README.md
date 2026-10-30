# FailureLab AI

FailureLab AI is a Meta-model investigator that finds why a simulated rotating machine
vibrates by designing and running experiments on a physics-based digital twin. A
simulator produces every measurement, a Bayesian engine produces every probability, and a
Meta model chooses experiments, states its predictions before each result and explains the
diagnosis, without ever seeing the true fault. **All data is simulated**; nothing here
claims validated real-world accuracy. Built for the Meta Global AI Developer Hackathon 2026
(track: Indie Developer).

Plans: [Product features](docs/PRODUCT_FEATURES.md) ·
[Technical design](docs/TECHNICAL_DESIGN.md) · [Decisions](docs/DECISIONS.md) ·
[Assumptions](docs/ASSUMPTIONS.md) · [API](docs/API.md)

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

On Windows, Python 3.12 can be installed with the Python install manager
(`pymanager install 3.12`), which provides `python3.12`.

Model access is optional for development. To enable the Meta model investigator, copy
`backend/.env.example` to `backend/.env` (git-ignored) and fill in the `FAILURELAB_LLM_*`
values. Never commit keys.

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

## Benchmark results (simulated)

Measured on 30 Oct 2026 with `python scripts/tasks.py benchmark` (150 runs per planner:
6 sealed cases × 5 seeds + 120 generated cases; budget 8 points; stop at 90%). All cases
are simulated with the same model family the engine assumes, so these numbers show the
method works when the model is structurally right, not real-world accuracy.

| Planner | Accuracy | Mean cost (points) | Mean experiments | Reached 90% | Runtime |
|---|---|---|---|---|---|
| `info_gain` | 99.3% | 2.15 | 2.07 | 96.7% | 36.4 s |
| `sweep` | 96.0% | 2.99 | 2.51 | 95.3% | 0.8 s |
| `random` | 98.0% | 3.90 | 2.79 | 94.0% | 0.9 s |

On this simulator every planner usually finds the fault within budget; the clear
difference is cost: `info_gain` needs about 28% fewer points than the fixed sweep and 45%
fewer than random choice. The hardest hypothesis is misalignment (`info_gain` 96%, `sweep`
84%). The Meta model has not been benchmarked yet.

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
