# Demo and recording guide

Investigation/lab and benchmark data are simulated. The Real recordings view uses measured laboratory signals (REAL_DATA.md). The Meta endpoint and saved `case-r2-meta-0-20261102030032` investigation were
verified live on 2 November 2026. Do not describe a rule-planner replay as a Meta investigation.

## Start the app

For rehearsal with the production build, use one terminal from the repository root:

```sh
python scripts/tasks.py build
python scripts/tasks.py serve
```

Open http://127.0.0.1:8000. This mode serves the dashboard and API together. See
[DEPLOYMENT.md](DEPLOYMENT.md) for hosting details.

For development with automatic reload, use the following two-server setup instead.
Run these commands in separate terminals from the repository root:

```sh
python scripts/tasks.py backend
python scripts/tasks.py frontend
```

Open http://localhost:5173. The backend API reference is at http://127.0.0.1:8000/docs.
The case picker automatically selects information gain until Meta access is configured.
Saved replays require the local backend, but do not need internet or model access.

## Three-minute recording script

Use the saved `case-r2-meta-0-20261102030032` replay to rehearse and record. It has two experiments and shows
how beliefs change. The compressor replay `case-b6-info_gain-0` has only one experiment;
do not promise multiple rounds when showing that replay. The verified Meta replay has two model-selected experiments and four model calls
with zero fallbacks; it diagnoses simulated misalignment at 94.7% probability.

| Time | Show | Narration |
|---|---|---|
| 0:00–0:20 | Case picker | “A rotating machine is vibrating. Several faults can look alike at one speed. FailureLab investigates by choosing what to measure next. Every machine and measurement in this investigation is simulated.” |
| 0:20–0:40 | Open conveyor gearbox replay; advance from prior to alarm | “This case began after the motor was remounted. The alarm gives one overall vibration level. The fault remains hidden from the investigator.” |
| 0:40–1:25 | First experiment: choice, predictions, measurement, updated beliefs | “The planner chooses a speed and load. These numerical predictions come from the physics and Bayesian engine before the measurement is revealed. Now the simulator runs the experiment, and the engine updates its beliefs.” |
| 1:25–1:55 | Second experiment, then diagnosis | “Each experiment costs budget. The investigation stops at 90% confidence or when no affordable experiment remains. The verdict includes remaining doubts and a physical check.” |
| 1:55–2:20 | Manual lab; increase bearing friction | “The public lab lets us test intuition. Friction changes broadband vibration, temperature and the response curve. The 3D twin illustrates measured features; it does not generate evidence.” |
| 2:20–2:50 | Benchmark, all runs | “On 150 simulated runs per planner, information gain achieved 99.3% accuracy at 2.15 points on average. Fixed sweep achieved 96.0% at 2.99 points. That is about 28% lower experiment cost in this simulator.” |
| 2:50–3:00 | Investigation screen | “FailureLab makes the experiment choices, predictions and evidence inspectable. It decides what data to collect next.” |

When showing a rule-planner replay, explicitly say “information-gain baseline.” For the Meta
recording, show its maintenance-note prior, model rationale, per-hypothesis expectations,
model-call count and fallback count. The Meta benchmark has run (VERIFICATION.md): on the
18 sealed simulated runs Meta used 1.78 experiment points against 2.33 for information gain,
but on the 72-pair challenge it used 1.92–1.96 against 1.875 and the paired intervals include
zero. Present the sealed-case saving only as applying to that small sample; a Meta cost
advantage is not established.

## Recording checks

- Use a clean browser view at desktop width, with readable text and the Simulated label.
- Open the chosen saved replay before recording. Restart it to return to starting beliefs.
- Use Forward to pause between predictions and results. Diagnosis appears only at the end.
- Keep credentials, `.env`, account pages and terminal history out of the recording.
- Record captions identifying this project's implementation and its simulated evidence.
- Review the exported video for readable numbers, correct planner labels and working audio.

## After the API key is ready

Set the key, model and base URL in `backend/.env`, using the actual values from the Meta
project. Restart the backend after editing configuration. Then run from the repository root:

```sh
backend/.venv/Scripts/python -m pytest backend/tests/test_llm_client.py
python scripts/tasks.py benchmark-meta
backend/.venv/Scripts/python backend/scripts/demo_replays.py --planner meta --cases case-r2
python scripts/tasks.py check
```

On Linux/macOS use `backend/.venv/bin/python` for the two direct interpreter commands.
Inspect model errors and fallback counts before treating a successful HTTP investigation
as evidence of working model choices: fallback can also complete an investigation.

## Recovery during a demo

- Backend unreachable: start the backend and reload the page.
- Model unavailable: use a previously verified Meta replay and identify it as recorded.
- Verified Meta replay missing: show the baseline honestly, name it as the baseline, and cite
  the recorded Meta results in VERIFICATION.md rather than claiming a live Meta run.
- WebGL unavailable: numerical readings, predictions, replay controls and diagnosis still work.
- Benchmark unavailable: run `python scripts/tasks.py benchmark` and reopen the Benchmark tab.

## Show the stronger proof

On Benchmark, show the challenge evidence panel and switch between no history,
misleading notes and injection notes. State: "These are 24 newly generated simulated
machines tested under three note conditions. Meta and the baseline each diagnosed
23 correctly in every condition, and the model had no fallbacks. Identical prompts
reuse a recorded reply, so the injection-note prior was effectively sampled once.
This larger challenge did not show a cost advantage." Open the paired-result audit to show
the retained failure and the downloadable evidence. Keep the earlier 23.8% saving
clearly attached to the separate 18-run sealed-case study.

## Show genuine machine evidence

Open `/?view=real`. Show the actual test-rig photograph and attribution. Switch
between measured sensors and inspect the real waveform and spectrum. Follow the
recorded Meta sensor-inspection sequence, then reveal the dataset label. State
that in study real-2 Meta classified 8/8 held-out trials correctly while the
reference-distance baseline scored 5/8, that the sample is eight trials from one
rig, and that the rig had deliberately introduced faults. Show a baseline mistake,
and mention that the superseded study real-1 (6/8 each) is preserved (REAL_DATA.md).
Do not call these live factory measurements, claim industrial reliability, or reuse
simulator probabilities.
