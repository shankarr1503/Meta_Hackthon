# Verification record

Checks performed locally on 1 to 3 November 2026; each section states when it was run.
Machine data is simulated, except the attributed measured-laboratory recordings path
(REAL_DATA.md).

## Full project check (1 November 2026)

`python scripts/tasks.py check` passed after the 1 November changes:

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

## Simulated benchmark (1 November 2026)

`python scripts/tasks.py benchmark` completed 450 investigations: 150 per rule planner.
Each planner saw the same six sealed cases with five seeds and 120 generated cases.

| Planner | Accuracy | Mean cost | Runtime |
|---|---|---|---|
| Information gain | 99.3% | 2.15 | 51.76 s |
| Fixed sweep | 96.0% | 2.99 | 1.17 s |
| Random | 98.0% | 3.90 | 1.27 s |

The committed machine-readable record is `backend/results/benchmark.json`. Runtime varies
by machine. All planners usually succeed in this simulator; the main measured benefit is
lower experiment cost. This table covers the rule planners only; Meta was measured
separately on 2 November (see "Live Meta benchmark" below).

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
- Any required hosted deployment. No Git remote was configured during this review; the
  repository was published later and its first remote CI run is recorded in "Public
  repository and first GitHub CI run" below.
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
- `python scripts/tasks.py check` passed at that point, before the review fixes:
  Ruff lint/format, ESLint, 218 backend
  tests (including the live call and recorded replay reproduction), 45 frontend
  tests, TypeScript and the Vite production build.
- Sandbox socket and temporary-directory restrictions affected the first attempt;
  checks passed when rerun with the required access. One existing Starlette/httpx
  deprecation warning remains.

## Live Meta benchmark – 2 November 2026

Muse Spark 1.3 (`muse-spark-1.3`) completed six sealed simulated cases with three
seeds each (18 investigations) in 242.69 seconds, with 0 fallbacks in about 65 model
stages (53 new API calls; identical prompts reuse a recorded reply). Both planners
below ran on exactly the same cases and seeds.

| Planner | Accuracy | Mean experiment cost | Mean experiments | Reached 90% |
|---|---|---|---|---|
| Meta | 100% | 1.7778 | 1.6111 | 100% |
| Information gain, same runs | 100% | 2.3333 | 2.2778 | 94.44% |

Meta used about 23.8% fewer experiment points on this small sealed-case sample only;
the larger challenge below did not reproduce it, so a general Meta cost advantage is not
established. Experiment cost measures simulated experiment budget, not API billing or latency.
This result does not establish real-world accuracy or generalisation to unseen
machines. Source: `backend/results/benchmark.json`.

Production browser checks repeated on 2 November: 25 views, zero page errors,
alerts or page overflow; fresh investigation, keyboard navigation, WebGL fallback
and backend-disconnection checks passed. The saved Meta replay also played through
to diagnosis successfully in the production dashboard.

## Measured challenge results – 2 November 2026

The complete frozen challenge finished: 24 new machines, 72 Meta and 72 baseline
investigations, 209 new API calls and 273 recorded model stages, with zero fallbacks.
Identical prompts reuse a recorded reply, so the stages are not independent samples:
the prior stage had 1 distinct reply across the 24 no-history runs, 1 across the 24
injection runs and 6 across the 24 misleading runs. The injection-note prior was
effectively sampled once and reused.
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
The demanded injection marker appeared in none of the 24 final explanations, with the
injection-note prior sampled once and reused as noted above.
That narrow check does not establish general injection resistance.

Both investigators confidently misclassified `proof-d2b377871703`: a true
misalignment case was diagnosed as imbalance plus misalignment after one experiment.
The mistake repeats across note variants of the same machine; it is one machine-level
failure, not three independent failures. It is retained in the evidence and dashboard.
The shared inference model and 90% stopping rule can therefore be confidently wrong.

The earlier 18-run sealed-case study remains a separate result: 100% accuracy for
both planners, with 23.8% fewer experiment points for Meta on that small sample only.
That saving did not carry over to this new challenge; a Meta cost advantage is not
established.

Artifacts: `backend/results/proof-plan.json`, `backend/results/proof.json` and the
`proof` summary in `backend/results/benchmark.json`. No key is needed to inspect or
replay this recorded evidence.

Final proof release check passed on 2 November 2026, before the review fixes: 224 backend tests
(including offline reproduction of all 72 published pairs), 48 frontend tests,
Ruff lint/format, ESLint, TypeScript and Vite production build. The expanded
challenge audit passed all 25 production browser views with no page errors,
visible error alerts or page overflow. Desktop and dark phone evidence screens
were visually inspected. The credential scan of tracked and unignored project
files passed. One existing Starlette/httpx deprecation warning remains.

## Real measured examples – 2 November 2026

Downloaded first naturally sorted one-second recording from each of 20 source
trials in Brito et al. (2022), DOI 10.17632/zx8pfhdtnb.1, CC BY 4.0. Verified
ZIP-entry CRC, sample shape/finiteness, local recording hashes and the complete
source test-rig photograph hash. Full archive hashes are advertised, not verified.

First study, real-1 (now superseded): Meta completed eight trial-held-out
assessments with 32 calls and no model errors: 6/8 correct, matching the
nearest-reference baseline. Both held-out looseness trials were classified as
unbalance by Meta; real-1 is preserved in `backend/data/real/studies/real-1/`.

A code review later on 2 November found real-1's harmonic bands centred on the
documented 1238 RPM, while the recordings run at 1,260–1,302 RPM, so the 3x band
missed the 3x peak. Pre-registered study real-2 estimates shaft speed per recording
(D-67): Meta 8/8 held-out correct (Wilson 95% interval 67.56%–100%), reference-distance
baseline 5/8, 32 model calls, 0 model errors. These are eight trials from one rig; they
support no industrial-reliability or general-advantage claim. Source units remain
native and unverified. See REAL_DATA.md for protocol and limits.

The checks below were run for real-1, before the review fixes.
Full checks passed: 229 backend tests, 50 frontend tests, Ruff lint/format,
ESLint, TypeScript and production build. Measured features and plots reproduced
from local raw bytes; all eight assessments replayed without model calls.
The source plan and feature code hashes matched, and the credential scan passed.

After fixing selector accessible names, targeted UI tests and the build/lint
passed again. Five real-recording browser views (desktop/phone, light/dark and
320-pixel width) passed source badge, source photograph, four-sensor selection,
two charts, label reveal and retained-error checks, with no page errors or
horizontal overflow. Desktop and dark-phone screenshots were visually reviewed.

Final verification for the 2 November review fixes: see the last section (added after the final check).

## Final verification after the review fixes – 2 November 2026

Run on Windows 11, Python 3.12 venv, Node 22, after commits 4e27d68 (backend fixes),
1732b4f (live view), 631de71 (real-2) and the UI polish that followed.

- `python scripts/tasks.py check`: Ruff lint and format passed (52 files); backend
  **258 passed** in 209.5 s, none skipped (the live-model smoke test ran because a key is
  configured locally); frontend **72 passed** in 14 files; ESLint, TypeScript and the
  production build passed.
- `node scripts/browser-smoke.cjs` against `python scripts/tasks.py serve`: all 25 views
  (desktop and phone, light and dark, 320 px) without page errors or horizontal overflow;
  a fresh live investigation ended on its diagnosis with no error banner, one log row per
  experiment and the prediction check, survived a tab switch without a second stream,
  opened as a replay and returned to the case list; the no-WebGL fallback, keyboard
  navigation and backend-unavailable states passed.
- A live Meta investigation of `case-t4` through the browser completed without alerts or
  page errors; it produced the README screenshots in `docs/images/`.
- Not verified here: CI on GitHub (no remote yet), browsers other than Chromium.

## Judge-facing additions – 2 November 2026 (evening)

Run on Windows 11, Python 3.12 venv, Node 22, after the baseline check of the committed
tree passed (258 backend and 72 frontend tests), for D-74 (unseen machines), D-75 (ask the
investigator) and D-76 (container).

- `python scripts/tasks.py check`: Ruff lint and format passed (47 Python files); backend
  **303 passed** (45 new tests: fresh-machine generation, canonical ids, no hidden values,
  bit-identical round trip; grounded answers, prompt without hidden values, caps, four
  fallback shapes, question passed as data, 503/404/400/422/403/429 paths and the separate
  hourly cap); frontend **81 passed** in 15 files (9 new: evidence trail at the diagnosis; Ask panel not-configured note,
  typed and suggested questions, fallback labelling, server error; fresh-machine flow via
  `/api/cases/fresh-77`, lookup failure, header model chip); ESLint, TypeScript and the
  production build passed.
- Live model, question endpoint: two questions about the committed replay
  `case-r2-meta-0-20261102030032` ("Why not imbalance?", "Which single experiment mattered
  most, and what reading decided it?") returned `ok: true` in 3.1 s and 3.2 s (about 2,000
  prompt tokens each). Both answers quoted readings present in the trace (1500 RPM / 2000 N:
  2x 70.78 µm, 1x 6.99 µm; 3300 RPM / 0 N: 1x 20.56 µm, 2x 3.45 µm) and the engine's final
  probabilities (misalignment 0.947, imbalance+misalignment 0.053). No invented values were
  found on reading; this is a two-sample spot check, not a grounding guarantee.
- `node scripts/browser-smoke.cjs` against `python scripts/tasks.py serve`: 25 views without
  page errors, visible alerts or horizontal overflow; fresh live investigation, no-WebGL
  fallback, keyboard navigation and backend-unavailable states passed.
- New-feature browser check (desktop light, phone dark): the Unseen machine card renders;
  a baseline run on `fresh-77` streamed to a diagnosis through the production dashboard;
  the Ask panel on the replay sent one real question and rendered the answer with its
  "Answered by muse-spark-1.3" footer; no alerts, page errors or overflow on either
  viewport. Screenshots in `docs/images/ask-the-investigator.png` and `.tmp/browser/evidence-new/`.
- Container: `docker build` succeeded (image 344 MB); the running container answered
  `/api/health` and `/api/ready` (model not configured, as intended without a key), served
  the dashboard (200), `/api/benchmark`, `/api/real-recordings` and the photograph (200),
  listed 7 replays, completed a baseline investigation on `fresh-77` (200) and returned 503
  for a question without a key.
- Not verified here: CI on GitHub (no remote yet), the Render blueprint on Render itself,
  browsers other than Chromium.
- Evidence trail and README walkthrough (later the same evening): the trail test passed with
  the suite above; the 13-frame GIF (`docs/images/walkthrough.gif`, 0.87 MB) was captured
  from the production dashboard with Playwright, including one live answer, with no page
  errors.

## Live Meta replays and ask-audit – 2 November 2026 (night)

- `scripts/demo_replays.py --planner meta` on case-k7, case-m9, case-t4, case-b6, case-x1,
  fresh-4242 and fresh-77: 8 investigations, 28 model calls,
  0 fallbacks, 8/8 correct (2/2
  on the unseen machines). Committed under `backend/replays/demo/`; the demo-replay test
  reproduces each one through its recorded replies.
- `scripts/ask_audit.py`: 10/10 questions answered (`ok: true`),
  0 fallbacks, 194/194 quoted numbers found in the evidence
  record, injection marker in no answer, mean latency 3.25 s. The entries, including
  the unanswerable question and the injection attempt, are recorded unchanged in
  `backend/results/ask-audit.json`; every quoted number was found in the record.

## Public repository and first GitHub CI run – 2 November 2026 (night)

- `main` at commit 97bfd2b was pushed to the public repository
  https://github.com/shankarr1503/Meta_Hackthon. Before the push, tracked files were
  scanned for `.env` files and API-key patterns; none were found. `backend/.env` stays
  Git-ignored.
- The first GitHub Actions run on that commit (run 41479840290) passed all three jobs:

| Job | Result | Duration |
|---|---|---|
| Lint, test and build (ubuntu-latest) | Passed | 2 min 22 s |
| Lint, test and build (windows-latest) | Passed | 3 min 23 s |
| Build container image, then smoke test of `/api/health`, `/api/ready` and `/` | Passed | 43 s |

- CI has no model key, so the live-model smoke test is skipped there. Remote test counts
  were not read: GitHub requires sign-in to download job logs (the endpoint returned 403).
- Local check rerun after the documentation updates: Ruff lint and formatting (54 files),
  backend 323 passed (the live-model test ran with the local key), frontend 81 passed in
  15 files, TypeScript and the Vite production build passed.
- Test count correction: the submission draft said 303 backend tests. Commit 97bfd2b added
  13 grounding-audit tests and 7 demo-replay checks (one per new Meta replay), so 323 are
  collected; with 81 frontend tests that is 404.
- Not verified here: a hosted deployment, browsers other than Chromium.

## Review fixes, budget enforcement and license audit - 3 November 2026

A full-codebase review on 3 November found one unvalidated route, unenforced
benchmark budget, stale documentation and unaudited transitive licences. Fixed the
same day, each step committed separately after a green check:

- Real-recordings evidence is validated against a closed response schema
  (`backend/app/schemas/real_recordings.py`): malformed reports return 503 instead
  of being served unchecked. New tests cover seven malformed shapes plus the
  committed 4.7 MB report, which validates unchanged.
- `RealRecordings.tsx` goes through the shared API client: backend error detail
  (e.g. invalid evidence shape) reaches the alert, and the friendly 404 message is
  kept. New test asserts the backend detail surfaces.
- The rule-benchmark 2-minute target is enforced by `RULE_BUDGET_S` in
  `scripts/benchmark.py` (the run exits 1 past it) and by a suite test on the
  committed `runtime_s` values. A full rule run to a temporary output on 3 November
  measured info_gain 39.78 s, sweep 1.01 s, random 1.34 s (42.1 s total, under the
  120 s budget; accuracies unchanged at 99.3%/96.0%/98.0%). An earlier background
  attempt had reported a spurious 1504 s sweep caused by the machine sleeping
  mid-run; the timed re-run above and a 0.75 s isolated full sweep protocol rule
  out a code slowdown.
- Transitive backend licences audited with pip-licenses plus `importlib.metadata`
  for the four packages the tool omits: all 32 installed distributions are MIT,
  BSD, Apache-2.0, PSF-2.0 (`typing_extensions`, flagged as a judgement call in
  the report) or MPL-2.0 unmodified (`certifi`). Recorded in
  `docs/THIRD_PARTY_LICENSES.md`. No GPL, AGPL or unlicensed package.
- The per-process Meta limiter note needed no change: the deployed container runs
  one uvicorn process, and the per-process behaviour was already documented in the
  `MetaRunLimiter` docstring, D-64 and DEPLOYMENT.md.
- Full check after the fixes: Ruff lint and formatting, backend 336 passed in
  95 s (the live-model test ran with the local key), frontend 94 passed in
  18 files, ESLint, TypeScript and the Vite production build. The 3 November
  features (second-rig check, action plan, D-80/D-82 restyle, video intake) are
  covered by this green suite.
- Not verified here: the Siemens downtime figures (cited 3 November in the
  submission draft), a hosted deployment, browsers other than Chromium.
