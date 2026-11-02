# Verification record

Checks performed locally on 1 November 2026. All machine data is simulated.

## Full project check

`python scripts/tasks.py check` passed after the changes:

- Ruff lint and formatting: passed (45 Python files already formatted).
- ESLint: passed.
- Backend: 216 passed, 1 skipped. The skipped test requires live Meta credentials.
- Frontend: 45 passed across 8 test files.
- TypeScript and Vite production build: passed.

One dependency warning remains: Starlette deprecates its httpx-based test client in favour
of httpx2. Existing tests pass; dependency migration was not performed during this review.

A follow-up run passed 214 tests but missed two existing wall-clock limits: candidate
ranking took 0.57 s (limit 0.5 s), and an investigation took 3.17 s (limit 2 s). Both timing
tests and all storage/dashboard tests then passed in isolation (13 passed in 3.29 s).
Timing limits were not relaxed; observed runtime depends on machine load.
The final complete check passed: 216 backend tests in 43.35 s, 45 frontend tests,
lint, formatting, TypeScript and the Vite production build.

## Browser integration

`node scripts/browser-smoke.cjs` exercises a running dashboard and backend without
calling a model. It captures cases, an investigation measurement,
diagnosis, manual lab and benchmark in these configurations:

| Configuration | Viewport | Theme |
|---|---|---|
| Desktop | 1440 × 1000 | Light and dark |
| Phone | 390 × 844 | Light and dark |
| Small phone | 320 × 720 | Light |

The 25 views passed checks for uncaught page errors, visible error alerts and page-level
horizontal overflow. The 3D scene rendered in the investigation and lab views. Screenshots
of desktop investigation, dark phone investigation and dark desktop lab were visually
reviewed. A fresh information-gain investigation also completed, saved and appeared in
the replay list through the real API.

The check was rerun against the production dashboard and API together at
`http://127.0.0.1:8000`, launched with `python scripts/tasks.py serve`. All 25 views and
the fresh saved investigation passed. WebGL-unavailable fallback, keyboard navigation
to the lab and backend-disconnection messaging also passed. The same three screenshots
were visually reviewed again after this run.

Production integration tests check dashboard HTML, JavaScript content type, working API
routes on the same origin, missing-build startup errors, API-only mode and rejection of
requests for configuration outside the build directory. CI is configured for Linux and
Windows; these workflow changes have not run remotely.

Local screenshots and detailed layout results are under `.tmp/browser/evidence/`
(git-ignored). The check overwrites those artifacts on the next run.

To reproduce, start the backend and frontend in separate terminals as described in
`docs/DEMO.md`, or use the single-process production launch in `docs/DEPLOYMENT.md` and
set `FAILURELAB_BROWSER_URL=http://127.0.0.1:8000`. From the repository root, install the
optional isolated verification tool:

```sh
npm install --prefix .tmp/browser --no-save --package-lock=false playwright@1.64.1
node .tmp/browser/node_modules/playwright/cli.js install chromium
node scripts/browser-smoke.cjs
```

On PowerShell systems that block `npm.ps1`, use `npm.cmd` for the install command.
Playwright 1.64.1 is Apache-2.0 licensed; it is temporary verification tooling and is not
bundled with the app. The check writes one runtime replay, `case-k7-info_gain-3`, which is
git-ignored. Set `FAILURELAB_BROWSER_URL` to use a different frontend address.

This check does not establish Safari/Firefox support, physical accuracy of the 3D
illustration or accessibility conformance.

## Simulated benchmark

`python scripts/tasks.py benchmark` completed 450 investigations: 150 per rule planner.
Each planner saw the same six sealed cases with five seeds and 120 generated cases.

| Planner | Accuracy | Mean cost | Runtime |
|---|---|---|---|
| Information gain | 99.3% | 2.15 | 51.76 s |
| Fixed sweep | 96.0% | 2.99 | 1.17 s |
| Random | 98.0% | 3.90 | 1.27 s |

The committed machine-readable record is `backend/results/benchmark.json`. Runtime varies
by machine. All planners usually succeed in this simulator; the main measured benefit is
lower experiment cost. Meta has not yet been measured.

## Fixes and regression coverage

- Simultaneous saves to the same deterministic replay id now use independent temporary
  files. A two-writer regression test synchronises replacement to exercise the race.
  A follow-up run exposed a transient Windows permission error when both writers replace
  the destination simultaneously. Saves now retry that error up to five attempts on
  Windows, with short delays; other errors still propagate.
  Deterministic tests also cover successful retry, exhausted retries with temporary-file
  cleanup, and immediate error propagation on other platforms.
- Investigation and lab seeds are normalised to integers within the API's accepted range.
  Frontend tests cover fractional input and the lab upper bound.
- Replay opening is disabled while a request is active.
- Panels and grid tracks can shrink on small phones; probability labels and numeric values
  remain readable without expanding the page.
- All six baseline demo replays are generated and checked for reproducibility by the suite.

The first verification attempt hit a Windows temporary-directory permission error. A later
attempt exposed generated `.pyc` caches referencing an old `Z:` drive location, causing
pytest to wait while looking up source paths. Generated bytecode under the workspace's
app, test and script folders was removed before rerunning; no source was removed.

## Still pending

- Final recorded video.
- Remote CI result, public repository URL and any required hosted deployment. No Git
  remote was configured during this review; no push or publication was performed.
- Owner confirmation of current official hackathon rules, eligibility and submission fields.

The public Meta and Cerebral Valley event overviews were checked on 1 November 2026;
source links and the limits of that check are in `docs/READINESS.md`. Full participant
rules and account-specific requirements remain pending.

## 2 November 2026: live Meta integration and build

- `backend/.env` is ignored by Git and is not tracked; credentials remain server-side.
- Live endpoint JSON smoke test passed using the local configuration.
- Saved `backend/replays/demo/case-r2-meta-0-20261102030032.json`: two
  model-selected experiments, four model calls, zero errors or fallbacks, and a
  simulated misalignment diagnosis at 94.6725% probability. This single run does
  not establish aggregate accuracy or fallback rate.
- `python scripts/tasks.py check` passed: Ruff lint/format, ESLint, 218 backend
  tests (including the live call and recorded replay reproduction), 45 frontend
  tests, TypeScript and the Vite production build.
- Sandbox socket and temporary-directory restrictions affected the first attempt;
  checks passed when rerun with the required access. One existing Starlette/httpx
  deprecation warning remains.

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

Production browser checks repeated on 2 November: 25 views, zero page errors,
alerts or page overflow; fresh investigation, keyboard navigation, WebGL fallback
and backend-disconnection checks passed. The saved Meta replay also played through
to diagnosis successfully in the production dashboard.

## Measured challenge results ? 2 November 2026

The complete frozen challenge finished: 24 new machines, 72 Meta and 72 baseline
investigations, 209 new API calls and 273 recorded model stages, with zero fallbacks.
The 95% Wilson accuracy interval is 79.76% to 99.26% in each condition.

| Note condition | Meta correct | Baseline correct | Meta mean points | Baseline mean points | Paired points saved, 95% interval |
|---|---|---|---|---|---|
| No history | 23/24 | 23/24 | 1.9167 | 1.8750 | -0.0417 (-0.2500 to 0.1250) |
| Misleading | 23/24 | 23/24 | 1.9167 | 1.8750 | -0.0417 (-0.1667 to 0.0833) |
| Injection | 23/24 | 23/24 | 1.9583 | 1.8750 | -0.0833 (-0.2500 to 0.0000) |

This challenge shows maintained accuracy under these note perturbations, not a
Meta accuracy or experiment-cost advantage. Meta mean investigation latency was
12.6, 14.0 and 13.1 seconds respectively; baseline mean latency was below 0.4 seconds.
These are observed latencies for this execution, including any cached responses.
The demanded injection marker appeared in none of the 24 final explanations.
That narrow check does not establish general injection resistance.

Both investigators confidently misclassified `proof-d2b377871703`: a true
misalignment case was diagnosed as imbalance plus misalignment after one experiment.
The mistake repeats across note variants of the same machine; it is one machine-level
failure, not three independent failures. It is retained in the evidence and dashboard.
The shared inference model and 90% stopping rule can therefore be confidently wrong.

The earlier 18-run sealed-case study remains a separate result: 100% accuracy for
both planners, with 23.8% fewer experiment points for Meta on that sample. Its cost
advantage did not carry over to this new challenge.

Artifacts: `backend/results/proof-plan.json`, `backend/results/proof.json` and the
`proof` summary in `backend/results/benchmark.json`. No key is needed to inspect or
replay this recorded evidence.

Final proof release check passed on 2 November 2026: 224 backend tests
(including offline reproduction of all 72 published pairs), 48 frontend tests,
Ruff lint/format, ESLint, TypeScript and Vite production build. The expanded
challenge audit passed all 25 production browser views with no page errors,
visible error alerts or page overflow. Desktop and dark phone evidence screens
were visually inspected. The credential scan of tracked and unignored project
files passed. One existing Starlette/httpx deprecation warning remains.

## Real measured examples ? 2 November 2026

Downloaded first naturally sorted one-second recording from each of 20 source
trials in Brito et al. (2022), DOI 10.17632/zx8pfhdtnb.1, CC BY 4.0. Verified
ZIP-entry CRC, sample shape/finiteness, local recording hashes and the complete
source test-rig photograph hash. Full archive hashes are advertised, not verified.

Meta completed eight trial-held-out assessments with 32 calls and no model
errors: 6/8 correct, matching the nearest-reference baseline. Both held-out
looseness trials were classified as unbalance by Meta and remain visible.
Source units remain native and unverified. See REAL_DATA.md for protocol and limits.

Full checks passed: 229 backend tests, 50 frontend tests, Ruff lint/format,
ESLint, TypeScript and production build. Measured features and plots reproduced
from local raw bytes; all eight assessments replayed without model calls.
The source plan and feature code hashes matched, and the credential scan passed.

After fixing selector accessible names, targeted UI tests and the build/lint
passed again. Five real-recording browser views (desktop/phone, light/dark and
320-pixel width) passed source badge, source photograph, four-sensor selection,
two charts, label reveal and retained-error checks, with no page errors or
horizontal overflow. Desktop and dark-phone screenshots were visually reviewed.
