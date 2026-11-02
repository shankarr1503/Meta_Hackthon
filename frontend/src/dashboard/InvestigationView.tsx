import type { Trace } from "../api/types";
import { count, hypothesisName, newtons, probability, plannerName, rpm, um } from "../format";
import SimulatedLabel from "../SimulatedLabel";
import { twinReading } from "../state/player";
import { useInvestigation } from "../state/useInvestigation";
import TwinPanel from "../twin/TwinPanel";
import AskPanel from "./AskPanel";
import BudgetMeter from "./BudgetMeter";
import DiagnosisCard from "./DiagnosisCard";
import ExperimentCard from "./ExperimentCard";
import ExperimentLog from "./ExperimentLog";
import Panel from "./Panel";
import PlayerControls from "./PlayerControls";
import ProbabilityBars from "./ProbabilityBars";

interface Props {
  trace: Trace;
  /** Whether the backend can answer questions about this replay with the Meta model. */
  metaConfigured?: boolean;
}

export default function InvestigationView({ trace, metaConfigured = false }: Props) {
  const player = useInvestigation(trace);
  const { view } = player;
  const fallbacks = trace.llm_events.filter((e) => e.fallback).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {trace.case.title} <span className="font-mono text-sm">({trace.case.case_id})</span>
          </h2>
          <p className="text-sm italic text-slate-600 dark:text-slate-400">“{trace.case.note}”</p>
          <p className="text-xs text-slate-500">
            Investigator: {plannerName(trace.planner)} · seed {trace.seed} · physics model{" "}
            {trace.model_version} · replay {trace.investigation_id}
            {trace.planner === "meta" &&
              ` · ${trace.llm_events.length} model calls, ${fallbacks} fell back to information gain`}
          </p>
        </div>
        <SimulatedLabel />
      </header>

      <PlayerControls player={player} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-4">
          <Panel title="Beliefs (Bayesian engine)">
            <ProbabilityBars probabilities={view.probabilities} />
            <p className="mt-2 text-xs text-slate-500">Line marks the 90% stopping target.</p>
          </Panel>
          <Panel title="Budget">
            <BudgetMeter remaining={view.budgetRemaining} budget={trace.budget} />
          </Panel>
          <Panel title="Digital twin">
            <TwinPanel reading={twinReading(trace, view)} seed={trace.seed} />
          </Panel>
        </div>

        <Panel title="Current step">
          {view.frame.kind === "prior" && (
            <p className="text-sm">
              <span className="font-semibold">Starting beliefs. </span>
              {trace.prior.reason}
            </p>
          )}
          {view.frame.kind === "alarm" && (
            <p className="text-sm">
              <span className="font-semibold">Alarm: </span>
              overall vibration {um(trace.alarm.overall_rms_um)} RMS at {rpm(trace.alarm.rpm)} and{" "}
              {newtons(trace.alarm.load_n)}. Only this single number is known so far.
            </p>
          )}
          {view.current && (
            <ExperimentCard
              experiment={view.current}
              predictions={view.showPredictions ? view.current.predictions : null}
              measured={view.showMeasurement ? view.current.measured : null}
              signals={view.showMeasurement ? view.current.signals : null}
              change={view.change}
            />
          )}
          {view.showDiagnosis && (
            <p className="text-sm">
              Investigation finished after {count(trace.experiments, "experiment")}: leading hypothesis{" "}
              {hypothesisName(trace.diagnosis.top)} at {probability(trace.diagnosis.probability)}.
            </p>
          )}
        </Panel>
      </div>

      <Panel title="Experiment log">
        <ExperimentLog steps={view.revealedSteps} />
      </Panel>

      {view.showDiagnosis && (
        <>
          <DiagnosisCard diagnosis={trace.diagnosis} stopReason={trace.stop_reason} />
          <AskPanel investigationId={trace.investigation_id} metaConfigured={metaConfigured} />
        </>
      )}
    </div>
  );
}
