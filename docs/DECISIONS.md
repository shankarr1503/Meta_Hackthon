# Decisions

One entry per decision. Newest last. Each entry says what was decided and why; when a
decision changes, add a new entry that supersedes the old one instead of editing it.

## Core design (from the Technical Design, original §14)

- **D-01 · 28 Oct 2026 · Meta model is the main planner.** Rule planners (`info_gain`,
  `sweep`, `random`) are the fallback and the baselines to beat.
- **D-02 · 28 Oct 2026 · The Bayesian engine computes all probabilities.** The model never
  supplies probabilities used for scoring, nor any measurement.
- **D-03 · 28 Oct 2026 · The model picks one of the top 5 candidates by information per
  cost.** It cannot propose arbitrary experiments.
- **D-04 · 28 Oct 2026 · Ground truth is isolated by code and schemas, enforced by tests.**
  Only `runner.py` and the API read `Scenario` objects.
- **D-05 · 28 Oct 2026 · One backend, one frontend, files for storage.** No database, no
  microservices.
- **D-06 · 28 Oct 2026 · The demo video is recorded from a committed replay** in
  `backend/replays/demo/`.

## Plan review resolutions (28 Oct 2026)

### Docs, repo and dates

- **D-07 · Specs live in Markdown.** The PDF plans were converted to
  `docs/PRODUCT_FEATURES.md` and `docs/TECHNICAL_DESIGN.md`. The PDFs are not committed
  (`/*.pdf` is git-ignored). The original TDD §14 was lost in the PDF export; D-01 to D-06
  replace it.
- **D-08 · Repo and build date.** Public GitHub repo `failurelab-ai`. The build starts on the
  date of the first commit, 28 Oct 2026, which replaces "27 October" everywhere. The local
  folder name does not matter.
- **D-09 · Track.** Indie Developer unless changed.
- **D-10 · Schedule.** The unreadable schedule image is replaced by a one-day-shifted plan:
  28 Oct foundation + physics; 29 Oct engine, planners, API; 30 Oct Meta model
  investigator; 31 Oct dashboard player; 1 Nov evidence panels + manual lab; 2 Nov 3D twin
  + benchmarks; 3 Nov hardening + demo video; 4 Nov submit before 9:00 PM ET. Cut order if
  late: streaming, benchmark screen, 3D twin, manual lab. Feature build days in
  PRODUCT_FEATURES.md §3 were re-assigned to match.

### Licenses

- **D-11 · Allowed licenses.** Permissive (MIT, BSD, Apache-2.0, ISC); weak copyleft used
  unmodified (MPL-2.0, e.g. certifi); CC-BY-4.0 data (caniuse-lite); OFL fonts (Google
  Fonts). Not allowed: GPL, AGPL, or anything without a license. The README lists direct
  dependencies with licenses and notes that transitive dependencies are under compatible
  licenses. CLAUDE.md updated to match.

### Tooling

- **D-12 · Versions.** CI uses Python 3.12 and Node 22 LTS with npm. Locally the venv is
  built with Python 3.12, not 3.15. Dependencies are pinned to exact versions released at
  least two weeks before 28 Oct 2026. TypeScript is pinned to 6.0.3 because
  typescript-eslint 8.71 supports `<6.1`.
- **D-13 · Task runner.** The Makefile detects the venv's `bin/` or `Scripts/` folder.
  `scripts/tasks.py` provides the same commands for machines without make (the main dev
  machine has none).

### API and contracts

- **D-14 · Health.** `GET /api/health` returns
  `{status, service, version, contract_version: "1"}`.
- **D-15 · `case_id` everywhere.** `ExperimentRequest` uses `case_id`; `scenario_id` is
  dropped.
- **D-16 · Meta not configured vs failing.** Planner default is `meta`. If the model is not
  configured, `POST /api/investigations` with planner `meta` returns 503 explaining how to
  configure it or use `info_gain`. If it is configured, per-call failures during a run fall
  back to `info_gain` and are logged in `llm_events`.
- **D-17 · Public case fields.** `/api/cases` returns exactly `case_id`, `title`, `note`,
  `initial_rpm` (2950), `initial_load_n` (500).
- **D-18 · Experiment response.** `amp_1x_um`, `amp_2x_um`, `broadband_um`, `temp_rise_c`,
  `time_s` + `displacement_um` (first 0.2 s, at most 400 points), `spectrum_freq_hz` +
  `spectrum_amp_um` (to 200 Hz), `source: "simulation"`, `model_version`. A test checks that
  hidden values never appear in it.
- **D-19 · Manual lab endpoint.** `POST /api/lab/simulate` takes
  `{imbalance, misalignment, friction, rpm, load_n, seed}` and simulates a public preset
  machine (wn 3600, thermal 1.0), not a sealed case, so it reveals no hidden truth. The
  response is labelled `source: "simulation"`, `kind: "lab"`.
- **D-20 · Investigation ids.** Rule planners `{case_id}-{planner}-{seed}`; Meta
  `{case_id}-meta-{seed}-{YYYYMMDDhhmmss}`. Both match `^[a-z0-9_-]{1,80}$`.
- **D-21 · API reference.** `docs/API.md` holds the endpoint table, request and response
  fields and error codes, and is updated whenever the API changes.

### Model, planners and inference

- **D-22 · Meta model not yet confirmed.** `.env.example` sets
  `FAILURELAB_LLM_PROVIDER=meta` with blank key, model and base URL. The adapter expects an
  OpenAI-compatible chat-completions endpoint unless the hackathon docs say otherwise.
- **D-23 · Prior floor.** `p_final = 0.05 + 0.7 · p_normalised`. With six hypotheses the
  minimum is exactly 5% and the sum is exactly 1.
- **D-24 · Sweep under budget.** The sweep runs its 10 points in order, skipping any it
  cannot afford, and stops when nothing affordable remains. Same budget for all planners.
- **D-25 · Expected information gain** uses feature-level noise only, not waveforms.
- **D-26 · Thermal grid.** Stays (0.75, 1.0, 1.3) with hidden values off-grid on purpose. If
  sealed-case accuracy misses the target, widen it to (0.7, 1.0, 1.4) and record that here.
- **D-27 · Temperature.** `T` is the bearing temperature rise above ambient, in °C; ambient
  is not modelled.

### Reproducibility, benchmark, storage

- **D-28 · Reproducibility.** Rule planners and replays are bit-identical for the same case
  and seed. Meta runs record every model response in the trace, so replaying a Meta trace is
  identical, but a new Meta run may differ.
- **D-29 · Benchmark timing.** The under-2-minute target applies to rule planners only. Meta
  runs as a separate command (`scripts/benchmark.py --planner meta`), starting with sealed
  cases × 3 seeds, with response caching and a configurable call limit.
- **D-30 · Replays in git.** Curated demo replays are committed in `backend/replays/demo/`;
  all other files in `backend/replays/` are git-ignored.
- **D-31 · Sealed cases.** The six sealed cases (ids, titles, notes, truths, wn, thermal) are
  fixed as listed in TECHNICAL_DESIGN.md §11.
- **D-32 · 3D twin tests** target the mapping functions, not WebGL rendering.
- **D-33 · Architecture block.** `app/schemas/` holds the Pydantic request and response
  models and is part of CLAUDE.md's architecture block.

## Later decisions

- **D-34 · 30 Oct 2026 · First commit date (supersedes the date part of D-08).** The skeleton
  was written on 28 Oct 2026 but first committed on 30 Oct 2026. Commits are never
  backdated; the README states both dates.
- **D-35 · 30 Oct 2026 · Planner interface.** `choose` also receives the steps recorded so
  far, so the Meta model's prompt can show the evidence history. Planners expose an
  `events` list that the loop copies into the trace's `llm_events`.
- **D-36 · 30 Oct 2026 · Stop reasons.** A trace records `stop_reason`: `confident` (top
  hypothesis at 90% or more, possibly straight after the alarm), `budget` (no points left)
  or `no_affordable_experiment`.
- **D-37 · 30 Oct 2026 · Signals in traces.** Each step stores its waveform preview and
  spectrum (rounded to 4 decimals) so the replay player can draw them without re-running
  the simulator.
