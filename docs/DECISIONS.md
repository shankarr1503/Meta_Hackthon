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
- **D-38 · 30 Oct 2026 · Experiment `kind`.** Experiment responses carry
  `kind: "case"` and lab responses `kind: "lab"`, so the UI can label which machine a
  reading came from.
- **D-39 · 30 Oct 2026 · Lab response curve.** `/api/lab/simulate` also returns the
  noise-free 1x and 2x curve over 0–6,000 RPM for the requested faults and load, so the
  manual lab's response curve comes from the simulator, not the browser.
- **D-40 · 30 Oct 2026 · Settings on the app.** `create_app(settings)` stores settings on
  `app.state`; replay and results folders are settings, so tests use temporary folders.
- **D-41 · 30 Oct 2026 · Adapter built before the endpoint was confirmed.** The owner has
  Meta model API access (spending cap 150 USD) but the endpoint format was not yet
  confirmed when step 4 was built, so `llm_client.py` follows D-22 (OpenAI-compatible chat
  completions). The live smoke test confirms it once `backend/.env` is filled; only
  `llm_client.py` changes if it differs.
- **D-42 · 30 Oct 2026 · Meta events and replays.** Each model call is logged as
  `{call, model, response, ok, fallback, usage}`, plus `error_kind` and `error` on failure.
  `ReplayClient` replays these responses in order, so re-running a Meta trace through it
  reproduces the trace exactly. Fallback steps are labelled `chosen_by: info_gain_fallback`.
- **D-43 · 30 Oct 2026 · Thermal grid stays (0.75, 1.0, 1.3).** `info_gain` is 100% accurate
  on the sealed cases (30 runs), so D-26's fallback of widening the grid is not needed.
- **D-44 · 30 Oct 2026 · One results file.** The rule and Meta benchmarks both merge their
  planner entries into `backend/results/benchmark.json`. Meta responses are cached in
  `backend/results/llm_cache.json` (git-ignored); `--max-calls` (default 200) caps new model
  calls per run, and calls beyond it fall back to `info_gain` like any model failure.
- **D-45 · 30 Oct 2026 · Benchmark commands.** `make benchmark` / `make benchmark-meta`, or
  `python scripts/tasks.py benchmark` / `benchmark-meta`. The script adds `backend/` to its
  import path so it never runs a stale installed copy of the app.
- **D-46 · 30 Oct 2026 · Player frames.** Each trace becomes frames: prior, alarm, then per
  experiment choice → predictions → measurement → updated probabilities, then diagnosis.
  The budget is charged when a measurement is revealed. Auto-play advances every 1.4 s.
- **D-47 · 30 Oct 2026 · Investigator default in the UI.** The case picker defaults to the
  Meta model when `/api/ready` reports it configured, otherwise to information gain, and
  disables running Meta when it is not configured.
- **D-48 · 30 Oct 2026 · Twin follows revealed measurements only.** The twin shows the
  latest revealed measurement at its own operating point; before the first measurement it
  spins at the alarm speed with no whirl, because the alarm gives only an overall level.
  The 3D scene is lazy-loaded and replaced by a text note where WebGL is unavailable.
- **D-49 · 30 Oct 2026 · Demo replays.** Demo replays are generated by
  `scripts/demo_replays.py` (rule planners now; Meta once the model is configured) and a
  test re-runs each one and requires an identical trace.
- **D-50 · 30 Oct 2026 · Meta id collisions (extends D-20).** A Meta id is reserved by
  creating its replay file exclusively before the run; if two runs start in the same
  second, later ones get `-2`, `-3`, …. A failed run releases its reservation.
- **D-51 · 30 Oct 2026 · Replay robustness.** Replays are written to a temporary file and
  renamed into place. The list skips unreadable files and shows each id once (a saved run
  shadows a demo replay with the same id, matching `load`). Loading an unreadable or
  outdated replay returns 404 with an explanation.
- **D-52 · 30 Oct 2026 · Like-for-like Meta comparison.** The Meta benchmark (sealed cases ×
  3 seeds) also scores `info_gain` on exactly those runs as `info_gain_meta_cases`. Each
  planner's protocol records its model version, rules and measurement time. The benchmark
  screen shows which runs each row covers.
- **D-53 · 30 Oct 2026 · Run service.** `app/api/runs.py` builds planners and ids, runs and
  saves investigations for both the API and `scripts/demo_replays.py`; model clients are
  closed after each run. Every exception from the model client becomes `LLMError` and falls
  back to `info_gain`.
- **D-54 · 30 Oct 2026 · Not changed: replay list cost.** The list endpoint reads every
  replay file. At hackathon scale (tens of files) this is fast enough; an index file would
  add moving parts for no visible gain.
- **D-55 · 30 Oct 2026 · Meta model confirmed: Muse Spark 1.3 (supersedes D-22, D-41).**
  The owner's Meta Model API project (dev.meta.ai) offers the Muse family. FailureLab uses
  `muse-spark-1.3` in Standard mode ($1.25 / $4.25 per million input / output tokens;
  Standard mode does not use our content for training) via the OpenAI-compatible
  `POST https://api.meta.ai/v1/chat/completions`. Muse Wonder was rejected (3–5× the price,
  built for long agentic coding) and Contributor mode left to the owner (cheaper, but grants
  Meta training rights). Muse Spark always reasons, so requests send
  `max_completion_tokens: 4000` and `reasoning_effort` (default `low`), and the timeout is
  60 s. Temperature 0.2 is kept (allowed range 0–2).

- **D-56 · 1 Nov 2026 · Concurrent replay writes.** Rule investigations intentionally
  reuse deterministic ids. Each save now uses a unique temporary file in the replay
  directory, then atomically replaces the destination. Concurrent writers cannot share
  or remove one another's temporary file; the last successful replacement wins.
- **D-57 · 1 Nov 2026 · Valid UI seeds.** Investigation and lab controls truncate
  fractional seeds and clamp to their respective API ranges. Replay-open buttons are
  disabled while a request is active to prevent overlapping loads from the picker.
- **D-58 · 1 Nov 2026 · Demo evidence.** All six cases now have baseline demo replays.
  The rehearsal uses `case-r2-info_gain-0` (two experiments): the compressor seed-0
  replay has one experiment, so the original multi-round narration was inaccurate.
  A Meta recording must use a real, inspected Meta trace after API access is configured.
- **D-59 · 1 Nov 2026 · Small phone layout.** Shared panels have `min-width: 0` and
  mobile grids use one explicit shrinkable column, so charts and tables do not expand
  the page. Probability labels use narrower columns on phones. Browser checks cover
  320-pixel and 390-pixel widths as well as desktop light and dark themes.
- **D-60 · 1 Nov 2026 · Single-process demo.** An optional frontend build directory is
  mounted after the API routes. `python scripts/tasks.py serve` selects `frontend/dist`
  and runs Uvicorn on localhost without reload. Builds are explicit and missing builds
  fail at startup. The production runtime does not need Node. CI now uses the cross-platform
  task runner on Windows and Linux; no hosted deployment has been created.
- **D-61 · 1 Nov 2026 · Windows replacement contention.** The concurrent-save test
  exposed transient permission errors during simultaneous Windows file replacement.
  Retry only `PermissionError` on Windows, up to five attempts with 10–40 ms delays.
  Exhausted retries and other errors propagate; temporary files are cleaned up.

## Paired proof challenge (2 November 2026)

Add a separate frozen challenge using seed 731904: four generated machines per
hypothesis, each under no-history, misleading-note and injection-note conditions.
Preserve all outcomes and compare Meta against information gain on the same
machine and sensor seed. Display Wilson accuracy intervals and paired bootstrap
cost intervals per condition; retain latency and fallbacks. Publish compact model
evidence and support exact offline replay. Keep the original 18-run results
separate. This is a simulation proof of concept, not real-machine validation.

## Real machine measurements (2 November 2026)

User requested real examples. Add a separate attributed measured-laboratory path,
not a conversion of the simulator to a claimed real-world model. Use Brito et al.
(2022), DOI 10.17632/zx8pfhdtnb.1, CC BY 4.0; first window per source trial.
Keep 12 reference trials separate from eight held-out trials. Hide query labels
and filenames from Meta; allow inspection only of already recorded sensors.
Preserve native amplitude units until calibration is verified. Keep the physical
rig photograph and source attribution visible. All code is original.

## Review fixes (2 November 2026)

A full code review on 2 November found the issues below; each fix ships with tests.

- **D-62 · 2 Nov 2026 · Model replies can never crash a run.** Replies that once escaped
  the fallback (integers beyond float range, integers longer than Python's digit limit,
  JSON nested thousands deep) now become `invalid_output` events and fall back to
  information gain, as CLAUDE.md requires.
- **D-63 · 2 Nov 2026 · Save before the final frame.** The live stream validates and saves
  the trace before it sends the `trace` frame, so the id a client receives always names a
  stored replay. The Meta id is reserved only once streaming starts, and released if the
  run fails before saving.
- **D-64 · 2 Nov 2026 · Cross-site guard and Meta budget.** The live stream is a GET with
  side effects (a paid Meta run). Requests a browser marks `Sec-Fetch-Site: cross-site`,
  or that carry an unknown `Origin` without that header, get 403. Each server process
  starts at most `FAILURELAB_META_RUNS_PER_HOUR` (default 30) Meta investigations per
  rolling hour; beyond that the API returns 429. Rule planners are not limited.
- **D-65 · 2 Nov 2026 · Settings fail fast.** `FAILURELAB_LLM_REASONING_EFFORT` must be
  empty or one of the client's supported values; an invalid value stops startup with a
  validation error instead of breaking each Meta run.
- **D-66 · 2 Nov 2026 · Harmonics need two shaft turns.** `extract_features` reports no
  1x/2x amplitude for windows shorter than two shaft cycles, as at standstill: the
  least-squares fit is ill-conditioned there (60 RPM over 0.04 s once gave 15,100 µm).
  Investigations (≥ 900 RPM, 1 s) are unaffected.
- **D-67 · 2 Nov 2026 · Real-data study real-2 supersedes real-1.** real-1 centred the
  harmonic bands on the documented 1238 RPM (20.63 Hz). The recordings actually run at
  1260–1302 RPM: their 3x peak near 65 Hz fell outside the 60.4–63.4 Hz band. real-2
  estimates each recording's shaft speed (harmonic-sum search within ±15% of nominal,
  first four harmonics, 1/8 Hz zero-padded spectrum) and centres ±1 Hz bands on it. The
  split, features and system prompt are unchanged. The real-2 plan was written before
  any real-2 model call. real-1's plan, replies and scores are kept under
  `data/real/studies/real-1/` and reported as superseded; nothing was deleted.
- **D-68 · 2 Nov 2026 · Compact measured evidence.** `real-recordings.json` is written
  without indentation (11 MB → 4.7 MB) and the API gzips JSON responses over 2 KB.
- **D-69 · 2 Nov 2026 · Timing tests take the best of three runs,** so scheduling noise
  on a shared CI runner cannot fail the 2 s and 0.5 s targets by chance.
- **D-70 · 2 Nov 2026 · Not changed: generated case names.** Generated benchmark cases
  are numbered in truth-label order. Meta never runs on them (the proof renames them to
  opaque ids and a neutral title), so the order is not exposed; changing the generator
  would invalidate the published rule-planner benchmark.
- **D-71 · 2 Nov 2026 · Live runs survive tab switches.** A running live investigation
  stays mounted (hidden) while another tab is shown, so returning never opens a second
  stream or starts a second paid Meta run. "Back to cases" ends it; "Open full replay"
  hands the saved trace to the replay player.
- **D-72 · 2 Nov 2026 · Prediction check.** Every experiment, live or replayed, shows the
  engine's prediction for each hypothesis, the Meta model's stated expectation, the
  measurement and the probability before → after, marking the largest rise. All values
  come from the trace; the dashboard computes no probability.
- **D-73 · 2 Nov 2026 · No displayed certainty.** Probabilities that round to 100.0% or
  0.0% (but are not exactly 0) display as ">99.9%" and "<0.1%". Accuracies, which are
  exact counts, still display as percentages.

## Judge-facing additions (2 November 2026)

- **D-74 · 2 Nov 2026 · Fresh machines.** `GET /api/cases/fresh-<seed>` (seed 0–10,000, no
  leading zeros) describes a new hidden simulated machine derived from the seed alone, and
  every experiment, investigation and stream endpoint accepts the id. The label, severities,
  critical speed and thermal factor all come from one generator seeded by the id, so, unlike
  the numbered benchmark cases (D-70), the id and title carry no fault order. The note says
  the machine is generated and has no history. `fresh_scenario` joins the hidden names the
  architecture test polices; the six sealed cases and `/api/cases` are unchanged. Purpose:
  a judge can investigate a machine nobody has seen, live, instead of a curated case.
- **D-75 · 2 Nov 2026 · Ask the investigator.** `POST /api/investigations/{id}/ask` sends a
  3–300 character question plus an evidence record built from the public trace (note,
  prior, alarm, each experiment's choice, stated expectations, engine predictions,
  measurements and probabilities, diagnosis) to the Meta model, which answers in at most
  120 words under a system prompt that forbids inventing readings or claiming the truth is
  known. The question is data inside the JSON payload, never part of the system prompt.
  Answers are returned to the dashboard and never saved into the replay, so replays stay
  bit-identical and the player, benchmark and proof verification are untouched. Failures
  return `ok: false` with a fallback that repeats the recorded explanation. Questions have
  their own hourly cap (`FAILURELAB_META_QUESTIONS_PER_HOUR`, default 120) and the same
  cross-site guard as runs. Works on rule-planner replays too: the model explains evidence
  it did not gather.
- **D-76 · 2 Nov 2026 · Container deployment.** A two-stage `Dockerfile` (Node 22 builds the
  dashboard; Python 3.12-slim serves it with the API on one origin, as a non-root user, with
  a health check on `/api/health` and `PORT` support) and a Render blueprint
  (`render.yaml`) make hosting a one-step job. `.dockerignore` keeps `.env`, caches, raw
  downloads and runtime replays out of the image; secrets are injected as environment
  variables by the host. CI builds the image on Linux so a broken Dockerfile fails the
  push. No hosted instance is created by the repository itself.
- **D-77 · 2 Nov 2026 · Meta replays for every case and a grounding audit.** Live Meta
  demo replays for all six sealed cases and two unseen machines are committed (replayed
  bit-identically by the demo test through their recorded replies), so the dashboard shows
  real Meta investigations without a key. `scripts/ask_audit.py` asks the live model a fixed
  list of 10 questions about those replays (including an instruction-injection
  attempt and a question the record cannot answer), records every answer unchanged in
  `backend/results/ask-audit.json`, and checks each number an answer quotes against the
  evidence record the model saw (numeric fields, numbers inside text fields, probabilities
  as percentages; display rounding allowed). A test re-runs that check offline. The audit is
  a spot check that numbers come from the record; it cannot judge whether a sentence is true.
- **D-78 · 3 Nov 2026 · Exploratory second-rig check, kept out of the scored evidence.**
  `scripts/second_rig_check.py` applies the measured feature family to a second public
  rig dataset (Marra & Marte 2024, Zenodo, DOI 10.5281/zenodo.10846291, CC BY 4.0),
  downloaded file-by-file at a pinned commit with per-file SHA-256. Five references and
  five held-out segments per condition (normal, unbalance, horizontal misalignment,
  bearing defect); a nearest-centroid baseline scored 20/20. Decision: because the
  source's recordings per condition are consecutive segments of one session, the result
  is labelled exploratory everywhere it is mentioned, is not pre-registered, makes no
  Meta call, and does not join the pre-registered real-data studies. The report
  (`backend/results/second-rig-check.json`) is committed and re-checked by a test from
  its stored features; raw downloads stay Git-ignored.
- **D-79 · 3 Nov 2026 · Action plan on the diagnosis card.** Every diagnosis now shows a
  maintenance action plan for the diagnosed fault class: where to look on the machine,
  likely root causes, ordered actions, and how to confirm the fix from the same
  measurements; compound faults combine both sections with a practical ordering note
  (align before balancing; restore the bearing before re-measuring). The content is
  static engineering practice in the frontend (`ActionPlan.tsx`), labelled "general
  guidance for this fault class, not a machine-specific work order"; it uses no model
  call and changes no trace, schema or probability. A diagnosed-component highlight in
  the 3D twin was considered and deferred: it would touch three views and need visual
  re-verification across themes and widths on the eve of submission.
- **D-81 · 3 Nov 2026 · Experimental video vibrometry.** A video of a vibrating machine
  contains the vibration as pixel motion sampled at the frame rate. The browser samples
  the mean luminance of a user-chosen patch per frame (`requestVideoFrameCallback`; the
  extraction closes on the `ended` event because the last frame callback can fire before
  `ended` is true) and sends only that series — never the video — to
  `POST /api/video/analyze` (closed schema, 64–20,000 samples), which reuses the
  existing Hann-window spectrum and reports peaks and, given a nominal speed, the shaft
  estimate and 1x/2x/3x amplitudes below Nyquist. `POST /api/video/assess` has the Meta
  model read those derived features only (prompt forbids certainty and instructs it to
  flag an insufficient frame rate), with the question-rate cap, a 503 without a key and
  a deterministic fallback. Grounding: a unit test recovers a synthetic 25 Hz signal
  with its half-amplitude 2x exactly; an end-to-end browser check recovered a generated
  5 Hz flashing clip through the full UI with a correct live model reading. The feature
  is labelled experimental and uncalibrated everywhere and feeds no benchmark, study or
  probability; image upload was rejected in favour of video because video carries
  measurable motion while a photo would only invite unvalidated guessing.
- **D-82 · 3 Nov 2026 · Structural de-templating pass.** Audited against a published
  checklist of AI-generated design tells. Changes: the six identical case cards became a
  divided work-queue list with compact actions (accessible names unchanged); the action
  plan and Ask answers lost their nested card chrome in favour of hairline dividers;
  panels and badges moved from rounded-lg to near-square corners with letter-spaced
  micro-labels; the H1 gained weight. Borders and colors continue to carry meaning only
  (status, the diagnosis, the dashed not-yet-generated machine). No text, behaviour or
  accessible name changed; all 93 frontend tests and the demo scripts pass unchanged.
- **D-80 · 3 Nov 2026 · Industrial monochrome restyle.** The template-default indigo
  accent is replaced everywhere: chrome (buttons, active tab, status chip, diagnosis
  border, badges, focus rings) is now slate monochrome — near-black actions in light
  mode, inverted in dark mode — and one deep blue is reserved for data and affordances
  (links, the leading probability bar, the lab slider). Status colors (amber simulated
  badge, emerald rise, red errors) are unchanged. No layout, text or behaviour change;
  verified in the browser in both themes.
