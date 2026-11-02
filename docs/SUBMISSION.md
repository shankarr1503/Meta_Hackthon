# Submission draft

This is a draft for the owner to review and submit. Account eligibility, current organiser
rules, repository visibility, hosting and final video links have not been verified here.

## Project name

FailureLab AI

## One sentence

An AI investigator that chooses experiments on a simulated rotating machine, compares
predictions with measurements, and explains the evidence behind a fault diagnosis.

## Problem

A vibration alarm identifies a symptom. Several faults can produce similar readings at
one operating point, so a useful next step is deciding which speed and load to test.
FailureLab makes this experiment-selection process inspectable and measurable.

## What we built

We built a physics simulator, six sealed machine cases, a Bayesian inference engine,
an investigation loop, a Meta model adapter, validated model choices with fallbacks,
saved replay traces, a React dashboard, a manual experiment lab, a measured-feature
3D twin and a reproducible benchmark against fixed and random test plans.

The model's intended role is to interpret the maintenance note, choose among the
engine's top five experiments, state expectations and explain the evidence. The simulator
produces every measurement; the Bayesian engine computes the posterior probabilities.
Model output is validated, and failures are logged before the baseline takes over.
The model receives public case information and measurements, never hidden case truth.

## Evidence available now

The rule-planner benchmark was rerun on 1 November 2026: six sealed cases with five
seeds each and 120 generated cases, for 150 investigations per planner. Each uses the
same eight-point budget and 90% stopping target.

| Planner | Accuracy | Mean cost | Mean experiments |
|---|---|---|---|
| Information gain | 99.3% | 2.15 | 2.07 |
| Fixed sweep | 96.0% | 2.99 | 2.51 |
| Random | 98.0% | 3.90 | 2.79 |

Source: `backend/results/benchmark.json`. These results use the same physics model family
as inference and do not establish real-world accuracy or robustness to unmodelled faults.
The cost comparison is observed at the accuracies above; it is not an equal-accuracy
controlled comparison.

## Meta verification

Live endpoint smoke test and end-to-end Meta investigation passed on 2 November 2026.
Replay `case-r2-meta-0-20261102030032` contains two model-selected experiments, four
model calls and zero fallbacks, reaching 94.7% simulated misalignment probability.
Playback and diagnosis also passed in the production dashboard.

The full Meta benchmark is complete; measured results are recorded below.

## Materials the owner must supply

- Public repository URL. No Git remote was configured during this review.
- Final demo video URL; use `docs/DEMO.md` to rehearse and record it.
- Hosted demo URL if required by the submission form; the app currently runs locally.
- Team member names, track selection and eligibility confirmation.
- Confirmation of the current official rules, deadline and required submission fields.

The public [Meta event page](https://dev.meta.ai/events/global-hackathon) and
[organiser page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon), checked on
1 November 2026, list a 4 November, 9 PM ET submission deadline and include manufacturing
under the Push the Frontier theme. The public pages do not establish the complete project
submission fields, video duration, team-size limit or publication requirements; confirm
those in the participant portal. The existing three-minute recording guide is a rehearsal
format until the participant requirements are confirmed.

Verify the remaining owner materials before submitting.

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

## Additional proof challenge

A frozen 24-machine challenge completed 72 paired note-condition runs. Meta and
information gain each diagnosed 23/24 machines correctly in every condition,
including misleading and injection notes. Meta had zero fallbacks across 273
recorded stages (209 new API calls). This new sample did not demonstrate a cost
advantage. One confidently wrong machine is preserved in all its note variants.
The dashboard exposes confidence intervals, latency, every paired result and
downloadable raw model evidence. See PROOF_OF_CONCEPT.md for the full protocol
and limits. That challenge uses simulated evidence; the separate real-data study is below.

## Real machine evidence (2 November 2026)

A separate real-recording view now processes physical accelerometer measurements
from the CC BY 4.0 Brito et al. (2022) rotor dataset, with original test-rig
photograph and provenance. Meta and a reference-distance baseline each classified
6/8 trial-held-out examples correctly. Two looseness examples were labelled
unbalance by Meta. These are genuine laboratory measurements; the sample does
not establish industrial reliability. See REAL_DATA.md for source and protocol.
