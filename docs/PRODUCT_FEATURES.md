# FailureLab AI — Product Feature Document

28 Oct 2026 · Meta Global AI Developer Hackathon 2026

This document defines what FailureLab AI will do and how we will know each feature
works. Build started on 28 October 2026 (the date of the first commit); nothing here
describes code written before the event. Converted from the original PDF plan, with the
resolutions in [DECISIONS.md](DECISIONS.md) applied.

## 1. Overview

**One line:** FailureLab AI is a Meta-model investigator that finds why a simulated rotating
machine is vibrating by designing and running experiments on a physics-based digital
twin.

**How it works.** A vibration alarm opens a case. The Meta model reads the maintenance
note, forms competing fault hypotheses, chooses the experiment that best separates
them, and runs it on a physics simulator through a validated tool. A Bayesian engine turns
each measurement into updated probabilities. The loop repeats until the system is 90%
sure or its experiment budget runs out, then the model explains the diagnosis and
recommends the next physical check. The investigator never sees the true fault.

| Item | Choice |
|---|---|
| Theme | Push the Frontier: a Meta model applied to a hard manufacturing problem (fault diagnosis by experiment design) |
| Track | Indie Developer (change to Startup only if submitting as a company) |
| Team | Up to 4; one person submits with every member added |
| Build window | 26 October – 4 November 2026; build started 28 October |
| Deadline | Wednesday 4 November, 9:00 PM ET |
| Status | Planning complete; code being written from scratch in the public repo `failurelab-ai` |

**Why it is not a generic project.** It is not a chatbot, RAG app, image analyser or advice tool.
The model acts: it chooses experiments, commits to predictions before seeing results,
and is scored against measured outcomes.

## 2. Problem and users

**The problem.** When a rotating machine vibrates too much, finding the cause is the
expensive part. Imbalance, misalignment and bearing friction can look alike at one
operating point. Engineers separate them by testing at different speeds and loads, and
every test costs downtime and some risk to the machine. A monitoring dashboard says
something is wrong; it does not say which test to run next.

| User | Need | What FailureLab gives them |
|---|---|---|
| Maintenance engineer | The likely cause and the next physical check | Diagnosis card with a recommended action |
| Reliability engineer | Proof the diagnosis is justified | Every experiment, its predictions, its result and how probabilities moved |
| Engineering student | Intuition for fault signatures | Manual lab with live readings and response curves |
| Hackathon judge | Evidence the AI investigates rather than guesses | Live investigation and a benchmark against fixed test plans |

## 3. Feature list

Must features make the demo work; Should features make it stronger; Could features are
cut first. Build days follow the schedule in TECHNICAL_DESIGN.md §13.

| ID | Feature | Priority | Build day |
|---|---|---|---|
| F1 | Physics simulator: 1x, 2x, broadband vibration and bearing temperature rise for any valid speed and load | Must | 28 Oct |
| F2 | Six sealed cases with maintenance notes; hidden ground truth | Must | 28 Oct |
| F3 | Bayesian engine: probabilities for six hypotheses after every measurement | Must | 29 Oct |
| F4 | Rule-based planners (information gain, fixed sweep, random) as baselines and fallback | Must | 29 Oct |
| F5 | Investigation loop: alarm, experiments, stopping rule, diagnosis | Must | 29 Oct |
| F6 | Meta model investigator: reads the note, chooses experiments, states predictions, explains | Must | 30 Oct |
| F7 | Saved traces and offline replay | Must | 29 Oct |
| F8 | Investigation screen: probability bars, experiment log, prediction versus result, diagnosis card | Must | 31 Oct – 1 Nov |
| F9 | Case picker and replay list | Must | 31 Oct |
| F10 | Benchmark: Meta model vs rule planners on the same cases | Must | 2 Nov |
| F11 | Manual lab: speed, load and fault sliders with live readings (public preset machine) | Should | 1 Nov |
| F12 | 3D digital twin driven by measurements | Should | 2 Nov |
| F13 | Live step streaming during an investigation | Could | 3 Nov |
| F14 | Benchmark screen in the dashboard | Should | 2 Nov |

## 4. Feature details and acceptance criteria

### Investigation (F2, F3, F5, F7)

A case opens with a monitoring alarm: one overall vibration level at 2,950 RPM and 500 N.
The investigator runs experiments, each costing 1 budget point (2 above 4,000 RPM) from
a budget of 8, and stops at 90% confidence or when nothing affordable is left.

- Case list shows exactly `case_id`, `title`, `note`, `initial_rpm` and `initial_load_n`, and
  nothing about the true fault.
- Every step records the operating point, cost, who chose it and why, each hypothesis's
  predictions before the run, the measurement, and the updated probabilities.
- The diagnosis names the top fault, its probability, every other hypothesis still at 5% or
  more, a recommended physical check and an explanation.
- Rule planners (`info_gain`, `sweep`, `random`) give a bit-identical trace for the same case
  and seed.
- Meta runs record every model response in the trace, so replaying a Meta trace is
  identical; a new Meta run with the same seed may differ.
- Every investigation is saved and replays offline, identical to the original.

### Meta model investigator (F6)

The Meta model is the main investigator, with three jobs: turn the maintenance note into
starting beliefs, choose each experiment from the most informative candidates while
stating what each hypothesis should show, and explain the result in plain language.

- Model output is validated; invalid or missing output falls back to the information-gain
  planner and is logged.
- No hypothesis can start below 5% (`p = 0.05 + 0.7 · p_normalised`), so a misleading note
  cannot rule out the truth.
- The model never supplies measurements or the probabilities used for scoring.
- Prompts never contain hidden case values; a test checks this.
- The model's stated expectations appear on screen before each result.
- If the model is not configured, a Meta investigation request returns 503 explaining how to
  configure it or use `info_gain`.

### Simulator and manual lab (F1, F11)

- Each fault shows its textbook signature, checked by tests: imbalance grows with
  speed squared and ignores load; misalignment shows strong 2x that grows with load;
  friction raises temperature and broadband vibration.
- Manual lab simulates a public preset machine (critical speed 3,600 RPM, thermal factor
  1.0), never a sealed case, and updates all four readings and the response curve as
  sliders move.
- Every result is labelled as simulated.

### Dashboard and twin (F8, F9, F12, F14)

- Investigation screen steps forward and back through a trace; every panel follows the
  current step.
- Probability bars show numbers, not colour alone, with a 90% line.
- The 3D twin's wobble follows measured 1x, its shape follows 2x, and bearing tint
  follows temperature rise; the exaggeration factor is shown.
- Works in light and dark themes and by keyboard.

### Benchmark (F10, F14)

- Every planner is scored on the same cases with the same budget and stopping rule.
- Reports accuracy, mean experiments, mean cost, share reaching 90% and accuracy
  when 90% sure.
- Results are reported as measured, including failures.

## 5. Out of scope

- Real sensor data, real machines or plant integrations.
- Claims of validated, industrial-grade accuracy.
- Machines other than one shaft on two bearings, or more than six hypotheses.
- User accounts, sharing, databases, microservices or multi-agent orchestration.

## 6. Success metrics

Targets set before building. Every number in the demo will come from runs made during
the event.

| Metric | Target |
|---|---|
| Accuracy on 120 unseen simulated cases | At least 95% |
| Experiment cost, information gain vs fixed sweep | Lower at equal accuracy |
| Experiment cost, Meta model vs information gain | Equal or lower on cases with notes |
| Accuracy when the system says 90% or more | At least 90% |
| Meta model fallbacks | Under 5% of calls |
| Investigation time without the model | Under 2 seconds |
| Rule-planner benchmark run time | Under 2 minutes |
| Sealed demo cases diagnosed correctly | 6 of 6 |

## 7. Demo story

The 3-minute video uses `case-b6`, the compressor coupling with a combined fault,
because it needs several experiments and shows belief shifting more than once. The
exact numbers will come from our own run during the event.

1. **0:00–0:20 — Hook.** "This compressor is shaking. Unbalanced, misaligned, a dry bearing,
   or two at once? Watch the Meta model decide which tests to run."
2. **0:20–0:45 — The alarm.** Case card and maintenance note; one overall reading; six
   hypotheses, none convincing.
3. **0:45–2:00 — The investigation.** For each experiment: the model's reasoning and
   predictions appear, then the measurement, then the probability bars move.
4. **2:00–2:30 — The verdict.** Diagnosis, confidence, remaining doubts, recommended
   physical check, explanation.
5. **2:30–3:00 — The proof.** Benchmark: Meta model and information gain against a fixed
   sweep on unseen cases. Close: "It doesn't just read data. It decides what data to
   collect."

The video is recorded from a committed replay in `backend/replays/demo/`, so it is calm,
repeatable and safe from network problems. Captions mark what the team built during the
event.

## 8. Hackathon rules compliance

| Rule | How we comply | Check |
|---|---|---|
| New work only (26 Oct – 4 Nov) | All code written from scratch in a repo whose first commit is 28 October; no code from earlier experiments | [ ] |
| Identify contributions | README section "Built during the hackathon" with dated features; small dated commits; demo captions | [ ] |
| Public repo | Repository `failurelab-ai` public before submission | [ ] |
| Rights to code, data, assets | Permissive or compatible licenses only, listed in the README (see DECISIONS.md); simulated data; MIT license on our code | [ ] |
| Not a banned or generic project | Experiment-design agent for manufacturing diagnostics; not health, RAG, education, image, job, nutrition, personality or sports | [ ] |
| Theme fit | Push the Frontier: Meta model at the centre of a manufacturing problem | [ ] |
| Meta models used | Meta model drives the investigation; confirm model and access in the hackathon docs | [ ] |
| Team and track | Indie Developer; up to 4 members; one submitter; all members added | [ ] |
| Demo video | 3 minutes, linked in the submission | [ ] |
| Eligibility | Every member 18+; no Meta or Cerebral Valley staff, contractors, government-affiliated people or their households | [ ] |
| Deadline | Submitted before Wednesday 4 November, 9:00 PM ET | [ ] |

**Planning material.** This document and the design mockups are planning, not code. The
original PDFs are not committed. Confirm with the organisers whether showing them is
allowed; if in doubt, show only what was built in the repo.
