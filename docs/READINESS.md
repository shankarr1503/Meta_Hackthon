# Remaining work

Local development and the baseline demo do not need a model key. Use
[DEPLOYMENT.md](DEPLOYMENT.md) to launch the built dashboard and API together (or the
container), and [DEMO.md](DEMO.md) to rehearse. Simulation evidence and real laboratory
measurements are reported separately; see REAL_DATA.md.

## Engineering status (2 November 2026, evening)

Everything the repository can verify on its own is done and recorded in
[VERIFICATION.md](VERIFICATION.md):

1. Meta model configured locally (Git-ignored `backend/.env`); live smoke test, 18-run
   sealed benchmark, 72-pair challenge and real-data study real-2 complete.
2. Ask the investigator (D-75) built, tested with a fake model and checked live: two
   answers about the saved `case-r2` replay quoted the recorded readings correctly, and
   one more was asked through the production dashboard by the browser check.
3. Unseen machines (D-74) built and tested; a baseline run on `fresh-77` completed through
   the production dashboard and inside the container.
4. Container (D-76) built locally (344 MB) and smoke-tested: health, ready, dashboard,
   benchmark, real recordings, photograph, a fresh-machine run, and a clean 503 for
   questions without a key.
5. Full check green: Ruff, ESLint, TypeScript, backend and frontend tests, production
   build; browser check of 25 views plus the new card and panel on desktop and phone.
6. README, API reference, decisions, assumptions, product features, technical design,
   demo script and submission draft updated.
7. Live Meta demo replays committed for all six sealed cases and two unseen machines
   (8/8 correct, 0 fallbacks); grounding audit of the question feature recorded
   (10/10 answered, 194/194 numbers traced to the evidence) and re-checked by a test.

## Owner and external items

| Item | Current state | Next action |
|---|---|---|
| Git hosting | Public repository https://github.com/shankarr1503/Meta_Hackthon; `main` pushed on 2 November 2026 | Keep `main` pushed after each commit; CI result is recorded in VERIFICATION.md |
| Hosted demo | Dockerfile and `render.yaml` verified locally | Create a Render Blueprint from the public repository, enter `FAILURELAB_LLM_API_KEY` in the Render dashboard, deploy; or run the image on another host (DEPLOYMENT.md) |
| Final video | Script in DEMO.md rehearsed against the production build | Record the three-minute script (one live Meta run, one live question, one unseen machine); upload and supply its URL |
| Team and eligibility | Account-specific details unavailable | Confirm in the participant portal and add members |
| Submission form and rules | Public event overview checked on 1 November | Confirm detailed rules, judging criteria and exact fields in the participant portal; paste SUBMISSION.md |

The benchmark defaults to a 200-new-call limit and caches responses locally. Cached calls
are reused; hitting the limit causes logged fallbacks and must be reflected in the result.
Hosted Meta usage is bounded per server process by `FAILURELAB_META_RUNS_PER_HOUR` (30)
and `FAILURELAB_META_QUESTIONS_PER_HOUR` (120).

No repository publication, remote CI run, external deployment or final submission has
been performed by the local checks.

## Proof challenge complete

The 24-machine, three-condition challenge and evidence panel are implemented. All 72
paired investigations are retained and reproduce offline. Meta matched the baseline at
23/24 correct per condition with zero fallbacks, but did not improve experiment cost on
this sample. Identical prompts reuse a recorded reply, so the injection-note prior was
effectively sampled once. See PROOF_OF_CONCEPT.md before making performance claims.

## Real machine examples complete

The Real recordings view uses actual physical-rig accelerometer signals and the source
photograph under CC BY 4.0. Open `/?view=real`; details and the small held-out result are
in REAL_DATA.md (study real-2: Meta 8/8, reference-distance baseline 5/8, eight trials
from one rig; superseded real-1: 6/8 each). It is recorded laboratory evidence, not a
live factory deployment or a validated industrial diagnostic product.
