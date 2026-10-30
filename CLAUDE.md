# CLAUDE.md — FailureLab AI

Read this before every task. These rules apply to all work in this repository.

## What we are building

FailureLab AI is a Meta-model investigator that finds why a simulated rotating
machine vibrates by designing and running experiments on a physics-based
digital twin. A simulator produces every measurement, a Bayesian engine
produces every probability, and a Meta model chooses experiments, states
predictions before each result, and explains the diagnosis. The investigator
must never see the true fault.

Full specs: docs/PRODUCT_FEATURES.md and docs/TECHNICAL_DESIGN.md. Decisions
that override them: docs/DECISIONS.md. Treat them as plans, not code.

## Hackathon rules (Meta Global AI Developer Hackathon, 26 Oct – 4 Nov 2026)

- **New work only.** Write all code here from scratch. Never copy code from
  earlier projects, zips, pastes or chats.
- **Identify contributions.** Keep the README section "Built during the
  hackathon" current: features with dates, and every dependency with its license.
- **Rights.** Allowed: permissive licenses (MIT, BSD, Apache-2.0, ISC), weak
  copyleft used unmodified (MPL-2.0, e.g. certifi), CC-BY-4.0 data
  (caniuse-lite) and OFL fonts (Google Fonts). Not allowed: GPL, AGPL, or
  anything without a license. No copied assets, datasets or code. Our code is
  MIT-licensed.
- **Public repo.** No secrets, ever. Keys live only in `backend/.env`, which is
  git-ignored. `backend/.env.example` holds blank placeholders.
- **Meta model at the centre.** The Meta model is the main investigator.
  Rule-based planners are the fallback and the baselines to beat.
- **Honesty.** All data is simulated. Label it in code, API, UI and docs.
  Never claim validated real-world accuracy.
- **Deadline.** Submit by Wednesday 4 November, 9:00 PM ET.

## Architecture

```
backend/app/
  physics/model.py        simulator — the only source of numbers; imports nothing else
  inference/engine.py     Bayesian engine — imports only physics
  cases.py                hidden scenarios (ground truth) + public CaseView
  runner.py               the ONLY bridge to hidden scenarios: run(rpm, load, i)
  agent/planners.py       info_gain, sweep, random
  agent/meta_planner.py   Meta model planner: prior, choose, explain
  agent/llm_client.py     model adapter: complete(system, user) -> str
  agent/investigate.py    investigation loop: receives CaseView + run, never a Scenario
  api/                    routes; request models forbid extra keys
  schemas/                Pydantic request and response models (closed)
backend/scripts/benchmark.py   may read labels to score; app/ never imports it
frontend/src/             api/, state/, dashboard/, twin/, lab/, benchmark/
```

Dependency rules (enforced by a test): physics imports nothing from the app;
inference imports only physics; agent never receives a Scenario; only runner.py
and the API read Scenario objects; the frontend talks only to /api.

## The ten engineering layers — every change respects them

1. **System design.** Simulator makes numbers; engine makes probabilities;
   Meta model chooses and explains; dashboard only displays.
2. **Data structures & algorithms.** Vectorise with NumPy. No Python loops over
   particles in hot paths. Document the complexity of new algorithms.
3. **Debugging.** All randomness is seeded. Rule planners and replays are
   bit-identical for the same case and seed. Meta runs record every model
   response in the trace, so a Meta replay is identical, but a new Meta run may
   differ. Every investigation is saved as a replayable trace.
4. **Testing.** Every feature ships with tests. `make check` passes before commit.
5. **Scalability.** One investigation under 2 s without the model; rule-planner
   benchmark under 2 minutes. The Meta benchmark is a separate command
   (`scripts/benchmark.py --planner meta`) with caching and a call limit.
6. **Security.** Closed request schemas. Hidden truth reachable only through
   runner.py. Model output validated, length-capped, with fallback. Prompts
   built from public data only.
7. **DevOps.** CI runs lint, tests and build on every push. Setup is one command.
   Without make, `python scripts/tasks.py <command>` runs the same targets.
8. **Clean code.** Type hints, small functions, clear names, Ruff and ESLint clean.
9. **Architecture.** Follow the dependency rules above.
10. **Maintenance.** Update README, docs/ASSUMPTIONS.md and docs/DECISIONS.md
    whenever behaviour changes.

## Meta model rules

- The model never supplies measurements or the probabilities used for scoring.
- Prior from the note: renormalised, then `p = 0.05 + 0.7 * p_normalised`
  (minimum exactly 5%, sum exactly 1).
- Experiment choice: one of the top 5 candidates by information per cost,
  with a rationale and expected result per hypothesis.
- Any failure (timeout, HTTP error, invalid JSON, out-of-range choice) falls
  back to the info_gain planner and is logged in the trace's `llm_events`.
  If the model is not configured at all, a `meta` investigation request
  returns 503 instead.
- Tests use a fake client. Live-model tests are skipped when no key is set.
- Confirm the hackathon's Meta model and API format before building the client.

## Working method

1. For anything larger than a small fix: reply with a plan and the file list
   first, and wait for approval.
2. Build in small steps. Run `make check` after each. Commit when green, with a
   clear one-line message.
3. Finish every task with: files changed, commands run, tests that ACTUALLY
   passed, commits made. Never claim something you did not run.
4. If a requirement is unclear or conflicts with these rules, stop and ask.

## Definition of done

- [ ] Tests written for the new behaviour and passing
- [ ] `make check` green locally and in CI
- [ ] README "Built during the hackathon" updated
- [ ] ASSUMPTIONS.md / DECISIONS.md updated if behaviour changed
- [ ] No secrets in the diff
- [ ] No claim in docs or UI that tests or the benchmark do not support
