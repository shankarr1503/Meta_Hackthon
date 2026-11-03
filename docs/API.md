# API reference

All endpoints are under `/api`, JSON only. Interactive docs at `/docs` when the backend
runs. All data is simulated except `/api/real-recordings`, which serves attributed measured
laboratory recordings. Contract version: `1`. Update this file whenever the API
changes. Every request model rejects unknown keys with `422`.

| Method | Path | Purpose | Errors |
|---|---|---|---|
| GET | `/api/health` | Service liveness | — |
| GET | `/api/ready` | Physics model version and whether the Meta model is configured | — |
| GET | `/api/cases` | Public fields of the six sealed cases | — |
| GET | `/api/cases/{case_id}` | Public fields of one case: sealed, or a fresh machine `fresh-<seed>` | 404 |
| POST | `/api/experiments` | One simulated experiment on a sealed case | 404, 422 |
| POST | `/api/lab/simulate` | One simulated experiment on the public preset lab machine | 422 |
| POST | `/api/investigations` | Run and save an investigation | 403, 404, 422, 429, 503 |
| GET | `/api/investigations/stream` | Run an investigation live as Server-Sent Events | 403, 404, 422, 429, 503 |
| GET | `/api/investigations` | List saved replays | — |
| GET | `/api/investigations/{id}` | Load a replay | 400, 404 |
| POST | `/api/investigations/{id}/ask` | Ask the Meta model about a finished investigation | 400, 403, 404, 422, 429, 503 |
| GET | `/api/benchmark` | Latest benchmark results | 404 if not yet run |
| GET | `/api/proof/download` | Proof challenge evidence as a JSON attachment | 404 |
| GET | `/api/real-recordings` | Measured laboratory recordings report | 404, 503 |
| GET | `/api/real-recordings/photo` | Source test-rig photograph (CC BY 4.0) | 404 |
| POST | `/api/video/analyze` | Spectrum from a client-extracted motion series (experimental) | 422 |
| POST | `/api/video/assess` | Meta model reading of video-extracted features (experimental) | 403, 422, 429, 503 |

## `GET /api/health`

`{status: "ok", service: "failurelab-ai", version, contract_version: "1"}`.

## `GET /api/ready`

`{status: "ok", physics_model_version: "rotor-1", meta_model_configured: bool, meta_model}`.
`meta_model` is the configured model name, or `""` when not configured. Keys and endpoint
URLs are never returned.

## `GET /api/cases`

A list of objects with exactly `case_id`, `title`, `note`, `initial_rpm` (2950) and
`initial_load_n` (500).

## `GET /api/cases/{case_id}`

The same five public fields for one case. `case_id` is a sealed case id or a fresh
machine id `fresh-<seed>` with seed 0–10,000 written without leading zeros
(`fresh-7`, not `fresh-07`); anything else is `404`. A fresh machine (D-74) is a new
hidden simulated machine derived from its seed alone: the fault label, severities,
critical speed and thermal factor all come from one generator seeded by the id, so the id
and title reveal nothing about the fault. Its note states that it is generated and has no
maintenance history. Fresh ids work everywhere a sealed `case_id` does: experiments,
investigations and the live stream. Rule-planner replays of a fresh machine are named
`fresh-<seed>-<planner>-<seed>`.

## `POST /api/experiments`

| Field | Type | Rule |
|---|---|---|
| `case_id` | string | 1–64 chars, a sealed case (else 404) |
| `rpm` | number | 0–6,000 |
| `load_n` | number | 0–5,000, default 0 |
| `duration_s` | number | > 0 and ≤ 10, default 1 |
| `sample_rate_hz` | number | 500–50,000, default 5,000 |
| `seed` | integer | ≥ 0, default 0 |

A signal shorter than 16 samples returns `422`. Response (`ExperimentOut`):

| Field | Meaning |
|---|---|
| `amp_1x_um`, `amp_2x_um` | Fitted 1x and 2x amplitudes (µm) |
| `broadband_um` | RMS of the fit residual (µm) |
| `temp_rise_c` | Bearing temperature rise above ambient (°C) |
| `time_s`, `displacement_um` | First 0.2 s of the signal, at most 400 points |
| `spectrum_freq_hz`, `spectrum_amp_um` | Amplitude spectrum up to 200 Hz |
| `source` | always `"simulation"` |
| `kind` | `"case"` |
| `model_version` | physics model version, e.g. `"rotor-1"` |

Hidden case values (true faults, critical speed, thermal factor) never appear.

## `POST /api/lab/simulate`

Request: `imbalance`, `misalignment`, `friction` (each 0–1, default 0), `rpm` (0–6,000),
`load_n` (0–5,000, default 0), `seed` (≥ 0, default 0). Simulates the public preset machine
(critical speed 3,600 RPM, thermal factor 1.0), never a sealed case.

Response: the `ExperimentOut` fields with `kind: "lab"`, plus the noise-free response curve
over speed at the requested faults and load: `curve_rpm` (0–6,000 in steps of 100),
`curve_amp_1x_um`, `curve_amp_2x_um`.

## `POST /api/investigations`

Request: `case_id` (1–64 chars), `planner` (`meta`, `info_gain`, `sweep` or `random`,
default `meta`), `seed` (0–10,000, default 0).

- `404` for an unknown case.
- `503` for planner `meta` when the model is not configured; the message explains which
  `.env` values to set or to use `info_gain`.
- `429` for planner `meta` once this server has started `FAILURELAB_META_RUNS_PER_HOUR`
  (default 30) Meta investigations in the last hour. Rule planners are not limited.
- `403` when a browser marks the request as cross-site (`Sec-Fetch-Site: cross-site`), or
  it carries an `Origin` that is neither this host nor a configured CORS origin.

The trace is saved to `backend/replays/{investigation_id}.json` and returned. Ids:
`{case_id}-{planner}-{seed}` for rule planners and `{case_id}-meta-{seed}-{YYYYMMDDhhmmss}`
(UTC) for Meta, with `-2`, `-3`, … appended when several Meta runs of the same case and
seed start in the same second. All ids match `^[a-z0-9_-]{1,80}$`.

Trace fields:

| Field | Meaning |
|---|---|
| `investigation_id`, `planner`, `seed` | Identity |
| `case` | The public case fields |
| `source`, `model_version` | `"simulation"`, physics model version |
| `prior` | `{probabilities, reason}` |
| `alarm` | `{rpm, load_n, overall_rms_um, posterior}` |
| `steps[]` | `index`, `rpm`, `load_n`, `cost`, `chosen_by`, `rationale`, `information_bits` (or null), `expectations` (per hypothesis, Meta only, or null), `predictions` (per hypothesis `{amp_1x_um, amp_2x_um, temp_rise_c}`, made before the run), `measured` (`{amp_1x_um, amp_2x_um, broadband_um, temp_rise_c}`), `signals` (`{time_s, displacement_um, spectrum_freq_hz, spectrum_amp_um}`), `posterior`, `budget_remaining` |
| `experiments`, `cost`, `budget` | Totals |
| `stop_reason` | `confident`, `budget` or `no_affordable_experiment` |
| `diagnosis` | `top`, `probability`, `confident`, `ranked[]`, `remaining_doubts[]`, `recommended_check`, `explanation` |
| `llm_events[]` | Every Meta model call (empty for rule planners): `call` (`prior`, `choose:N`, `explain`), `model`, `response` (raw reply or null), `ok`, `fallback`, `usage` (token counts or null), and on failure `error_kind` (`model_error` or `invalid_output`) and `error` |

## `GET /api/investigations/stream`

Query: `case_id` (1–64 chars), `planner` (default `meta`), `seed` (0–10,000). Same errors as
`POST /api/investigations`, returned before streaming starts. The response is
`text/event-stream`; each event's `data` is one JSON frame with `kind`:

| `kind` | Payload (besides `investigation_id`, `case`, `planner`, `seed`) |
|---|---|
| `prior` | `prior: {probabilities, reason}` |
| `alarm` | `alarm: {rpm, load_n, overall_rms_um, posterior}` |
| `choice` | `step`, `candidate: {rpm, load_n, cost}`, `chosen_by`, `rationale`, `information_bits`, `expectations` |
| `predict` | `step`, `predictions` (engine prediction per hypothesis, before the run) |
| `result` | `step` (the full step: measurement and updated posterior) |
| `update` | `step` (same object; marks the belief update) |
| `diagnosis` | `diagnosis`, `stop_reason`, `experiments`, `cost` |
| `trace` | `trace` (the complete replay, identical to `POST /api/investigations`) |

The trace is validated and saved before the `trace` frame is sent, so its id always names
a stored replay. A Meta run that fails before saving releases its reserved id. Frames come
from the simulator and the Bayesian engine; the Meta model only chooses and explains.

## `GET /api/investigations`

A list of `{investigation_id, case_id, planner, seed, top, probability, experiments, cost,
demo}`: committed demo replays first, then saved runs, newest first. Each id appears once;
a saved run with the same id as a demo replay replaces it in the list, as it does when
loading. Unreadable files are skipped.

## `GET /api/investigations/{id}`

The saved trace. `400` if the id does not match `^[a-z0-9_-]{1,80}$`; `404` if no replay
has that id, or if the file is unreadable or from an older trace format. Looks in `backend/replays/` and then `backend/replays/demo/`.

## `POST /api/investigations/{id}/ask`

Request: `{question}` (3–300 characters; extra keys are `422`). Loads the saved replay
first (`400` for a malformed id, `404` if missing or unreadable), then requires the Meta
model (`503` when not configured, same message as a Meta run). Capped at
`FAILURELAB_META_QUESTIONS_PER_HOUR` (default 120) questions per server process per
rolling hour (`429`); this budget is separate from the investigation cap. Browser requests
marked cross-site get `403`.

The model receives the question and an evidence record built from the public trace only:
title and note, prior, alarm, each experiment's operating point, rationale, stated
expectations, engine predictions, measured features and probabilities after it, and the
diagnosis. It answers in at most 120 words. Response (`Answer`):

| Field | Meaning |
|---|---|
| `investigation_id`, `question` | The replay and the cleaned question (whitespace collapsed, capped at 300 characters) |
| `answer` | The model's answer, capped at 900 characters; on failure a fallback that repeats the recorded explanation |
| `model` | Model name |
| `ok`, `fallback` | `true, false` for a usable reply; `false, true` after a timeout, HTTP error or unusable JSON |
| `usage` | Token counts or null |
| `error_kind`, `error` | `model_error` or `invalid_output` and the message; null when `ok` |
| `source` | `"simulation"` |

Answers are returned only; they are never written into the replay, and they cannot change
a measurement, a probability or the diagnosis (D-75).

## `GET /api/benchmark`

The contents of `backend/results/benchmark.json`: `source: "simulation"`, `model_version`,
`generated_at`, `rules` (`budget`, `confidence_target`), `protocols` (per planner: seeds,
generated cases, runtime, physics model version, budget, confidence target and
`measured_at`; for Meta also the model and call counts) and `planners`. A Meta benchmark
also writes `info_gain_meta_cases`: `info_gain` on exactly the Meta runs. Each
planner maps groups (`all`, `sealed`, `generated`, `truth:<hypothesis>`) to `{runs,
accuracy, mean_experiments, mean_cost, reached_target, accuracy_when_confident,
fallback_rate}`. `404` until the benchmark has been run.

## Proof challenge evidence

After `python scripts/tasks.py proof`, `/api/benchmark` includes an optional `proof`
summary with the frozen plan hash, per-condition metrics, confidence intervals and
per-machine paired results. Note variants are correlated observations of the same
machine. Original benchmark planner rows are preserved separately.

`GET /api/proof/download` downloads `backend/results/proof.json` as a JSON attachment.
It contains every scored pair and compact investigation traces with raw model replies,
choices, predictions and measured features; signal arrays are omitted. `404` if the
challenge has not completed. This is retrospective simulated evidence and includes
truth labels used only by the evaluator, never by the investigator.

## Real recordings (2 November 2026)

GET `/api/real-recordings` returns the attributed measured-laboratory report: source
manifest, trial split, measured previews/features, recorded Meta sensor-inspection
actions and per-trial published labels for retrospective inspection. The stored file
is validated against a closed response schema; 404 if absent, 503 if the source is
not measured_laboratory or the shape is invalid. GET `/api/real-recordings/photo`
serves the original CC BY 4.0 test-rig photograph. Neither route calls the model.

## Video vibrometry, experimental (3 November 2026, D-81)

The browser samples the brightness of a user-chosen point in the user's own video,
frame by frame, and sends only that time series — never the video. Amplitudes are in
arbitrary pixel units: uncalibrated, and labelled so in every response's `note`.
Neither route feeds a benchmark, study or probability.

`POST /api/video/analyze` request (extra keys are `422`): `fps` (5–1,000),
`samples` (64–20,000 numbers), `nominal_rpm` (60–30,000, optional). Response:
`source: "video"`, `sample_rate_hz`, `duration_s`, `nyquist_hz` (half the frame
rate), `rms`, `crest_factor`, a 2-second waveform preview (`waveform_t_s`,
`waveform`), the Hann-window spectrum up to Nyquist (`spectrum_freq_hz`,
`spectrum`), the strongest local-maximum peaks (`peaks`, at most 5, at or above
0.5 Hz), and, when a nominal speed is given, `shaft_hz_estimate` (the frequency
near it whose visible harmonics carry the most energy) with 1x/2x/3x `harmonics`
below Nyquist.

`POST /api/video/assess` asks the Meta model to read derived features only:
`fps`, `duration_s`, `nyquist_hz`, `rms`, `crest_factor`, `peaks` (at most 5),
`shaft_hz_estimate`, `harmonics` (at most 3), `nominal_rpm`, `context` (at most 300
characters). The model sees the features and the context text; its prompt forbids
certainty and tells it to flag an insufficient frame rate. `503` without a key
(same message as a Meta run), `429` past the hourly Meta question cap, `403` for
browser requests marked cross-site. Response: `assessment`, `model`, `ok`,
`fallback`, `usage`, `error_kind`, `error`, `note`. A model failure returns a
deterministic fallback with `ok: false`.
