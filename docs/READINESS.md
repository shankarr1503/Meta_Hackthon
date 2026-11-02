# Remaining work

Local development and the baseline demo do not need a model key. Use
[DEPLOYMENT.md](DEPLOYMENT.md) to launch the built dashboard and API together, and
[DEMO.md](DEMO.md) to rehearse. Simulation evidence and real laboratory measurements are reported separately; see REAL_DATA.md.

## Meta verification

1. Complete: key configured in Git-ignored `backend/.env`; credential scan passed.
2. Complete: live endpoint smoke test passed on 2 November 2026:
   `backend/.venv/Scripts/python -m pytest backend/tests/test_llm_client.py -k live_model`.
   On Linux/macOS, use `backend/.venv/bin/python`.
3. Complete: real saved investigation generated:
   `backend/.venv/Scripts/python backend/scripts/demo_replays.py --planner meta --cases case-r2`.
4. Complete: inspected saved replay `case-r2-meta-0-20261102030032`: two model-selected
   experiments, four model calls, no errors or fallbacks. Production dashboard playback
   and diagnosis passed browser verification.
5. Complete: `python scripts/tasks.py benchmark-meta` passed on 2 November: 18/18
   correct diagnoses, 0 fallbacks in about 65 model stages (53 new calls), mean cost
   1.7778 vs 2.3333 on this small sealed-case sample only; the larger challenge did not
   reproduce the saving (see PROOF_OF_CONCEPT.md).
   Inspect the Meta and `info_gain_meta_cases` rows on the same cases and seeds. Record
   actual model identifier, accuracy, cost and fallback rate, even when targets are missed.
6. Complete: README, submission draft and verification record updated with measured results.
   Run `python scripts/tasks.py check`, restart the demo server and rehearse the actual
   Meta trace before recording the final video.

The benchmark defaults to a 200-new-call limit and caches responses locally. Cached calls
are reused; hitting the limit causes logged fallbacks and must be reflected in the result.

## Owner and external items

| Item | Current state | Next action |
|---|---|---|
| Git hosting | No remote configured | Supply or create the intended repository, then push and inspect remote CI |
| CI | Workflow checks Linux and Windows | Confirm both remote jobs pass after publication |
| Hosted demo | Local production launch prepared | Choose hosting and access settings; deploy using DEPLOYMENT.md if required |
| Final video | Script and baseline rehearsal ready | Record the verified Meta replay; upload and supply its URL |
| Team and eligibility | Account-specific details unavailable | Confirm in the participant portal and add members |
| Submission form and rules | Public event overview checked | Confirm detailed rules and exact fields in the participant portal |

Public event sources checked on 1 November 2026:
[Meta](https://dev.meta.ai/events/global-hackathon) and
[Cerebral Valley](https://cerebralvalley.ai/e/meta-ai-developer-hackathon).
They list 4 November, 9 PM ET as the submission deadline, subject to change. They describe
the tracks and themes; they do not expose the complete submission form or detailed rules
in the accessible page content. Do not mark account requirements complete from this overview.

No repository publication, remote CI run, external deployment or final submission has
been performed by the local checks. See [VERIFICATION.md](VERIFICATION.md) for evidence.

## Proof challenge complete

The new 24-machine, three-condition challenge and evidence panel are implemented.
All 72 paired investigations are retained and reproduce offline. Meta matched the
baseline at 23/24 correct per condition with zero fallbacks, but did not improve
experiment cost on this sample. Identical prompts reuse a recorded reply, so the
injection-note prior was effectively sampled once. See PROOF_OF_CONCEPT.md before making performance
claims. The evidence download contains all model replies and measured features.

## Real machine examples complete

The Real recordings view uses actual physical-rig accelerometer signals and
source photograph under CC BY 4.0. Open `/?view=real`; details and the small
held-out result are in REAL_DATA.md (study real-2: Meta 8/8, reference-distance baseline
5/8, eight trials from one rig; superseded real-1: 6/8 each). It is recorded laboratory evidence,
not a live factory deployment or a validated industrial diagnostic product.
