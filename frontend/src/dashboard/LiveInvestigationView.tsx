import { useEffect, useReducer, useState } from "react";

import { streamInvestigation } from "../api/client";
import type { CaseView, PlannerName, Trace } from "../api/types";
import { count, hypothesisName, newtons, probability, plannerName, rpm, um } from "../format";
import SimulatedLabel from "../SimulatedLabel";
import { currentExperiment, INITIAL_LIVE, liveReducer, type LiveState } from "../state/live";
import type { TwinReading } from "../twin/mapping";
import TwinPanel from "../twin/TwinPanel";
import AskPanel from "./AskPanel";
import BudgetMeter from "./BudgetMeter";
import DiagnosisCard from "./DiagnosisCard";
import EvidenceTrail from "./EvidenceTrail";
import ExperimentCard from "./ExperimentCard";
import ExperimentLog from "./ExperimentLog";
import Panel from "./Panel";
import ProbabilityBars from "./ProbabilityBars";

/** The backend budget; the stream states it only in the final trace. */
const DEFAULT_BUDGET = 8;

const PHASES: Record<LiveState["phase"], string> = {
  connecting: "connecting…",
  prior: "starting beliefs received",
  alarm: "alarm reading received",
  choice: "experiment chosen",
  predict: "engine predictions received",
  result: "measurement revealed",
  update: "beliefs updated",
  diagnosis: "diagnosis received; finishing the replay",
  trace: "investigation complete",
};

function progress(state: LiveState, experiment: number | null): string {
  if (state.error) return "Live stream stopped.";
  const phase = PHASES[state.phase];
  const step = ["choice", "predict", "result", "update"].includes(state.phase) && experiment
    ? ` (experiment ${experiment})`
    : "";
  return `Live stream: ${phase}${step}.`;
}

function twinReading(state: LiveState, caseView: CaseView): TwinReading {
  const latest = state.steps.at(-1);
  if (latest) return { rpm: latest.rpm, load_n: latest.load_n, measured: latest.measured };
  if (state.alarm) return { rpm: state.alarm.rpm, load_n: state.alarm.load_n, measured: null };
  return { rpm: caseView.initial_rpm, load_n: caseView.initial_load_n, measured: null };
}

interface Props {
  caseView: CaseView;
  planner: PlannerName;
  seed: number;
  /** Hands the finished, saved trace to the replay view. */
  onOpenReplay: (trace: Trace) => void;
  /** Whether the backend can answer questions about the finished run with the Meta model. */
  metaConfigured?: boolean;
}

/** Renders one live investigation as its frames arrive. Display only: no numbers are computed. */
export default function LiveInvestigationView({
  caseView,
  planner,
  seed,
  onOpenReplay,
  metaConfigured = false,
}: Props) {
  const [state, dispatch] = useReducer(liveReducer, INITIAL_LIVE);
  const caseId = caseView.case_id;

  useEffect(() => {
    let source: EventSource | null = null;
    // Open on the next tick: React StrictMode's development mount-unmount-mount then
    // opens one stream, not two, so no investigation (or paid model call) is started twice.
    const timer = window.setTimeout(() => {
      source = streamInvestigation(
        { case_id: caseId, planner, seed },
        (frame) => dispatch({ type: "frame", frame }),
        (trace) => dispatch({ type: "trace", trace }),
        (message) => dispatch({ type: "error", message }),
      );
    }, 0);
    return () => {
      window.clearTimeout(timer);
      source?.close();
    };
  }, [caseId, planner, seed]);

  const current = currentExperiment(state);
  const budget = state.trace?.budget ?? DEFAULT_BUDGET;
  const { trace, diagnosis } = state;

  // A live Meta run takes tens of seconds; show that the wait is normal.
  const [elapsed, setElapsed] = useState(0);
  const finished = trace !== null || state.error !== null;
  useEffect(() => {
    if (finished) return;
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [finished]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {caseView.title} <span className="font-mono text-sm">({caseId})</span>
          </h2>
          <p className="text-sm italic text-slate-600 dark:text-slate-400">“{caseView.note}”</p>
          <p className="text-xs text-slate-500">
            Investigator: {plannerName(planner)} · seed {seed} · live stream
          </p>
        </div>
        <SimulatedLabel />
      </header>

      <p role="status" aria-live="polite" className="text-sm text-slate-500">
        {progress(state, current?.experiment.index ?? null)}
        {!finished &&
          ` ${elapsed}s elapsed${planner === "meta" ? " — Meta model calls usually take about 10 seconds each; saved replays open instantly." : "."}`}
      </p>

      {state.error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-4">
          <Panel title="Beliefs (Bayesian engine)">
            <ProbabilityBars probabilities={state.probabilities} />
            <p className="mt-2 text-xs text-slate-500">Line marks the 90% stopping target.</p>
          </Panel>
          <Panel title="Budget">
            <BudgetMeter remaining={state.budgetRemaining ?? budget} budget={budget} />
          </Panel>
          <Panel title="Digital twin">
            <TwinPanel reading={twinReading(state, caseView)} seed={seed} />
          </Panel>
        </div>

        <Panel title="Current step">
          <div className="space-y-3">
            {current ? (
              <ExperimentCard
                experiment={current.experiment}
                predictions={current.predictions}
                measured={current.step?.measured ?? null}
                signals={current.step?.signals ?? null}
                change={current.change}
              />
            ) : state.alarm ? (
              <p className="text-sm">
                <span className="font-semibold">Alarm: </span>
                overall vibration {um(state.alarm.overall_rms_um)} RMS at {rpm(state.alarm.rpm)} and{" "}
                {newtons(state.alarm.load_n)}. Only this single number is known so far.
              </p>
            ) : state.priorReason !== null ? (
              <p className="text-sm">
                <span className="font-semibold">Starting beliefs. </span>
                {state.priorReason}
              </p>
            ) : (
              <p className="text-sm text-slate-500">Waiting for the first frame…</p>
            )}
            {diagnosis && (
              <p className="text-sm">
                Investigation finished after {count(diagnosis.experiments, "experiment")}: leading
                hypothesis {hypothesisName(diagnosis.diagnosis.top)} at{" "}
                {probability(diagnosis.diagnosis.probability)}.
              </p>
            )}
            {diagnosis && state.alarm && (
              <EvidenceTrail
                steps={state.steps}
                alarmPosterior={state.alarm.posterior}
                top={diagnosis.diagnosis.top}
              />
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Experiment log">
        <ExperimentLog steps={state.steps} />
      </Panel>

      {diagnosis && <DiagnosisCard diagnosis={diagnosis.diagnosis} stopReason={diagnosis.stop_reason} />}

      {trace && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Investigation complete and saved as replay{" "}
            <span className="font-mono">{trace.investigation_id}</span> (
            {count(trace.experiments, "experiment")}, {trace.cost} of {trace.budget} points).
          </p>
          <button
            type="button"
            onClick={() => onOpenReplay(trace)}
            className="rounded-sm bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Open full replay
          </button>
        </div>
      )}

      {trace && <AskPanel investigationId={trace.investigation_id} metaConfigured={metaConfigured} />}
    </div>
  );
}
