# API reference

All endpoints are under `/api`, JSON only. Interactive docs at `/docs` when the backend
runs. All data is simulated. Contract version: `1`. Update this file whenever the API
changes. Every request model rejects unknown keys with `422`.

| Method | Path | Purpose | Errors |
|---|---|---|---|
| GET | `/api/health` | Service liveness | — |
| GET | `/api/ready` | Physics model version and whether the Meta model is configured | — |
| GET | `/api/cases` | Public fields of the six sealed cases | — |
| POST | `/api/experiments` | One simulated experiment on a sealed case | 404, 422 |
| POST | `/api/lab/simulate` | One simulated experiment on the public preset lab machine | 422 |
| POST | `/api/investigations` | Run and save an investigation | 404, 422, 503 |
| GET | `/api/investigations` | List saved replays | — |
| GET | `/api/investigations/{id}` | Load a replay | 400, 404 |

## `GET /api/health`

`{status: "ok", service: "failurelab-ai", version, contract_version: "1"}`.

## `GET /api/ready`

`{status: "ok", physics_model_version: "rotor-1", meta_model_configured: bool, meta_model}`.
`meta_model` is the configured model name, or `""` when not configured. Keys and endpoint
URLs are never returned.

## `GET /api/cases`

A list of objects with exactly `case_id`, `title`, `note`, `initial_rpm` (2950) and
`initial_load_n` (500).

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

The trace is saved to `backend/replays/{investigation_id}.json` and returned. Ids:
`{case_id}-{planner}-{seed}` for rule planners and `{case_id}-meta-{seed}-{YYYYMMDDhhmmss}`
(UTC) for Meta, matching `^[a-z0-9_-]{1,80}$`.

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
| `llm_events[]` | Every Meta model call and fallback (empty for rule planners) |

## `GET /api/investigations`

A list of `{investigation_id, case_id, planner, seed, top, probability, experiments, cost,
demo}`: committed demo replays first, then saved runs, newest first.

## `GET /api/investigations/{id}`

The saved trace. `400` if the id does not match `^[a-z0-9_-]{1,80}$`; `404` if no replay
has that id. Looks in `backend/replays/` and then `backend/replays/demo/`.
