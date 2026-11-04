# Demo and recording guide

Investigation, lab and benchmark data are simulated. The Real recordings view uses measured
laboratory signals (REAL_DATA.md). The Meta endpoint, the saved
`case-r2-meta-0-20261102030032` investigation and the question endpoint were verified live
on 2 November 2026. Do not describe a rule-planner replay as a Meta investigation.

## Start the app

For rehearsal with the production build, use one terminal from the repository root:

```sh
python scripts/tasks.py build
python scripts/tasks.py serve
```

Open http://127.0.0.1:8000. This mode serves the dashboard and API together. See
[DEPLOYMENT.md](DEPLOYMENT.md) for hosting details, including the container.

For development with automatic reload, use the two-server setup instead, in separate
terminals from the repository root:

```sh
python scripts/tasks.py backend
python scripts/tasks.py frontend
```

Open http://localhost:5173. The backend API reference is at http://127.0.0.1:8000/docs.
The header chip says whether the Meta model is configured; without it the case picker
selects information gain. Saved replays need only the local backend.

## Three-minute recording script

Every sealed case and the unseen machines `fresh-4242` and `fresh-77` have a committed
live Meta replay (ids ending in a timestamp), so any case can be shown as a real Meta
investigation without a key. Record at desktop width in a clean browser window. The script below uses one live Meta
run and one live question (two to six model calls in total, a few seconds each); keep the
saved replay `case-r2-meta-0-20261102030032` open in a second tab as the fallback.
Quoted readings below (70 µm, 94.7%) are from that saved replay, verified against it
on 3 November; a live run will differ slightly, so read your run's numbers instead of
the script's.

| Time | Show | Narration |
|---|---|---|
| 0:00–0:15 | Case picker, header chip "Meta model muse-spark-1.3 · live" | "A rotating machine is vibrating. Imbalance, misalignment, a dry bearing, or two at once look alike at one speed. FailureLab hands the investigation to a Meta model: it decides which test to run next. Every machine here is simulated and labelled so." |
| 0:15–0:40 | Investigate Conveyor gearbox input with planner Meta; the prior frame | "It reads the maintenance note: the motor was re-mounted. Its starting beliefs lean to misalignment, but nothing drops below 5%: a note can be wrong." |
| 0:40–1:20 | First experiment: rationale, the six stated expectations, then the measurement and the prediction check | "Before the result, it writes down what each fault should show at 1,500 RPM under load. Then the simulator answers: 2x at 70 micrometres. Only the Bayesian engine moves the probabilities, and the table shows which hypotheses gained and lost." |
| 1:20–1:45 | Second experiment and the diagnosis card | "A second test at 3,300 RPM near the critical speed shows no imbalance peak. Misalignment at 94.7%, the remaining doubt named, and the physical check to do first." |
| 1:45–2:10 | Ask the investigator: type "Why not imbalance?" | "Now I can question it. The answer quotes the readings and operating points that ruled imbalance out. They are the same numbers in the experiment log: it answers from evidence, and the answer is never stored or scored." |
| 2:10–2:30 | Unseen machine card: type a seed not used before on camera, planner Meta or information gain | "Any seed names a machine nobody has seen. The same loop finds what is wrong — and about one machine in six is healthy, which it reports instead of inventing a fault." |
| 2:30–2:50 | Benchmark: planner table, then the challenge panel with the injection condition | "150 simulated runs per planner; information gain needs about 28% fewer experiment points than a fixed sweep. On 24 new machines with misleading and injected notes, Meta stayed at 23 of 24 and no injected text reached an explanation. We report that no cost advantage was shown there." |
| 2:50–3:00 | Real recordings: the rig photograph, a sensor spectrum, 8/8 vs 5/8 | "On real accelerometer recordings from a laboratory rig, the model labelled all eight held-out trials; the statistical baseline got five. One rig, eight trials: a promising start, not an industrial claim." |

Closing line: "It doesn't just read data. It decides what data to collect, says what it
expects, and shows its work."

Optional closing wow, if a few seconds remain: open **Video intake**, upload a phone
slow-motion clip of any vibrating object (a fan works), click a high-contrast edge,
Extract vibration, and ask the Meta model to read the spectrum. Say it is experimental
and uncalibrated; the point is that the same loop reaches anything you can film.

Optional opening stake, if the first scene has room: "Siemens prices unplanned downtime
at 1.4 trillion dollars a year for the world's 500 biggest companies — up to 2.3 million
dollars an hour in automotive" (The True Cost of Downtime 2024, cited in the README).

Keep the 23.8% saving attached to the 18-run sealed-case study only; the 24-machine
challenge did not reproduce it. If the live Meta run is slow, switch to the saved replay tab and say
it is a recording of an earlier live run.

Unseen-machine seeds for rehearsal (probed offline with the baseline on 3 November; a
machine probed or replayed before is no longer "unseen to us", so say so or pick a new
seed on camera): 77 is **healthy** and 4242 has **friction** (both already replayed, so
prefer a new seed); 16, 21, 24 and 28 are misalignment in about two experiments; 29 is
imbalance+misalignment in three; 17 is the same compound fault in five. Roughly one
seed in six is healthy, which is worth presenting as a feature: the investigator does
not invent a fault that is not there.

## Recording checks

- Use a clean browser view at desktop width, readable text and the Simulated label visible.
- Open the chosen saved replay before recording. Restart it to return to starting beliefs.
- Use Forward to pause between predictions and results. Diagnosis appears only at the end.
- Keep credentials, `.env`, account pages and terminal history out of the recording.
- Record captions identifying this project's implementation and its simulated evidence.
- Review the exported video for readable numbers, correct planner labels and working audio.

## Model access (configured 2 November 2026)

The key, model (`muse-spark-1.3`) and base URL are set in the git-ignored
`backend/.env` from the Meta project; the live benchmark, proof challenge, real-data
study and ask audit on 2 November all used it. To re-verify model access after any
configuration change, restart the backend and run from the repository root:

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
  The Ask panel then shows a labelled fallback instead of an answer; say so.
- Verified Meta replay missing: show the baseline honestly, name it as the baseline, and cite
  the recorded Meta results in VERIFICATION.md rather than claiming a live Meta run.
- WebGL unavailable: numerical readings, predictions, replay controls and diagnosis still work.
- Benchmark unavailable: run `python scripts/tasks.py benchmark` and reopen the Benchmark tab.
- Hourly cap reached (429): the dashboard says so; replays and the baseline still work.

## Show the stronger proof

On Benchmark, show the challenge evidence panel and switch between no history,
misleading notes and injection notes. State: "These are 24 newly generated simulated
machines tested under three note conditions. Meta and the baseline each diagnosed
23 correctly in every condition, and the model had no fallbacks. Identical prompts
reuse a recorded reply, so the injection-note prior was effectively sampled once.
This larger challenge did not show a cost advantage." Open the paired-result audit to show
the retained failure and the downloadable evidence.

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
