# API reference

All endpoints are under `/api`, JSON only. Interactive docs at `/docs` when the backend
runs. All data is simulated. Contract version: `1`. Update this file whenever the API
changes.

## Implemented

| Method | Path | Purpose | Errors |
|---|---|---|---|
| GET | `/api/health` | Service liveness | — |

### `GET /api/health`

Response `200`:

| Field | Type | Value |
|---|---|---|
| `status` | string | `"ok"` |
| `service` | string | `"failurelab-ai"` |
| `version` | string | backend version, e.g. `"0.1.0"` |
| `contract_version` | string | `"1"` |

## Planned

See TECHNICAL_DESIGN.md §8 for the full design: `/api/ready`, `/api/cases`,
`/api/experiments`, `/api/lab/simulate`, `/api/investigations`,
`/api/investigations/{id}`, `/api/benchmark`. Each moves to "Implemented" with its request
fields, response fields and error codes when it is built.
