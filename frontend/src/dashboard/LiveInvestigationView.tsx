import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  Diagnosis,
  LiveFrame,
  PlannerName,
  Step,
  Trace,
} from "../api/types";
import { count, celsius, hypothesisName, newtons, plannerName, rpm, um } from "../format";
import { streamInvestigation } from "../api/client";
import SimulatedLabel from "../SimulatedLabel";
import Panel from "./Panel";
import ProbabilityBars from "./ProbabilityBars";
import BudgetMeter from "./BudgetMeter";
import TwinPanel from "../twin/TwinPanel";
import type { TwinReading } from "../twin/mapping";
import SpectrumChart from "./SpectrumChart";
import ExperimentLog from "./ExperimentLog";
import DiagnosisCard from "./DiagnosisCard";

const INITIAL_BUDGET = 8;

const FRAME_LABELS: Record<string, string> = {
  prior: "Starting beliefs",
  alarm: "Alarm reading",
  choice: "Choosing experiment",
  predict: "Engine predictions",
  result: "Measurement revealed",
  update: "Beliefs updated",
  diagnosis: "Diagnosis",
  trace: "Investigation complete",
};

interface Props {
  caseId: string;
  caseTitle: string;
  caseNote: string;
  planner: PlannerName;
  seed: number;
}

export default function LiveInvestigationView({
  caseId,
  caseTitle,
  caseNote,
  planner,
  seed,
}: Props) {
  const [frames, setFrames] = useState<LiveFrame[]>([]);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const [probabilities, setProbabilities] = useState<Record<string, number>>({});
  const [budgetRemaining, setBudgetRemaining] = useState(INITIAL_BUDGET);
  const [steps, setSteps] = useState<Step[]>([]);
  const [alarm, setAlarm] = useState<{
    rpm: number;
    load_n: number;
    overall_rms_um: number;
    posterior: Record<string, number>;
  } | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  const latest = frames[frames.length - 1];

  const handleFrame = useCallback((frame: LiveFrame) => {
    setFrames((fs) => [...fs, frame]);
    switch (frame.kind) {
      case "prior":
        setProbabilities(frame.prior.probabilities);
        break;
      case "alarm":
        setAlarm(frame.alarm);
        setProbabilities(frame.alarm.posterior);
        break;
      case "result":
      case "update":
        setSteps((fs) => [...fs, frame.step]);
        setBudgetRemaining(frame.step.budget_remaining);
        setProbabilities(frame.step.posterior);
        break;
      case "diagnosis":
        setDiagnosis(frame.diagnosis);
        break;
      default:
        break;
    }
  }, []);

  const handleTrace = useCallback((t: Trace) => setTrace(t), []);

  const handleError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  useEffect(() => {
    const source = streamInvestigation(
      { case_id: caseId, planner, seed },
      handleFrame,
      handleTrace,
      handleError,
    );
    sourceRef.current = source;
    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [caseId, planner, seed, handleFrame, handleTrace, handleError]);

  const reading: TwinReading = useMemo(() => {
    const lastStep = steps[steps.length - 1];
    if (lastStep) {
      return { rpm: lastStep.rpm, load_n: lastStep.load_n, measured: lastStep.measured };
    }
    if (alarm) {
      return { rpm: alarm.rpm, load_n: alarm.load_n, measured: null };
    }
    return { rpm: 2950, load_n: 500, measured: null };
  }, [steps, alarm]);

  if (error) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        Live investigation failed: {error}
      </div>
    );
  }

  if (frames.length === 0) {
    return <p role="status">Starting live investigation…</p>;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {caseTitle} <span className="font-mono text-sm">({caseId})</span>
          </h2>
          <p className="text-sm italic text-slate-600 dark:text-slate-400">
            “{caseNote}”
          </p>
          <p className="text-xs text-slate-500">
            Investigator: {plannerName(planner)} · seed {seed} · live stream
          </p>
        </div>
        <SimulatedLabel />
      </header>

      <p className="text-xs text-slate-500">
        Receiving: {FRAME_LABELS[latest.kind] ?? latest.kind}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-4">
          <Panel title="Beliefs (Bayesian engine)">
            <ProbabilityBars probabilities={probabilities} />
            <p className="mt-2 text-xs text-slate-500">
              Line marks the 90% stopping target.
            </p>
          </Panel>
          <Panel title="Budget">
            <BudgetMeter remaining={budgetRemaining} budget={INITIAL_BUDGET} />
          </Panel>
          <Panel title="Digital twin">
            <TwinPanel reading={reading} seed={seed} />
          </Panel>
        </div>

        <Panel title="Current step">{renderCurrent(latest)}</Panel>

        {steps.length > 0 && (
          <Panel title="Experiment log">
            <ExperimentLog steps={steps} />
          </Panel>
        )}
      </div>

      {trace && diagnosis && (
        <DiagnosisCard diagnosis={diagnosis} stopReason={trace.stop_reason} />
      )}

      {trace && (
        <p className="text-xs text-slate-500">
          Investigation complete — replay{" "}
          <span className="font-mono">{trace.investigation_id}</span>{" "}
          ({count(trace.experiments, "experiment")}, {trace.cost} of {trace.budget} points).
        </p>
      )}
    </div>
  );

  function renderCurrent(frame: LiveFrame) {
    switch (frame.kind) {
      case "prior":
        return (
          <p className="text-sm">
            <span className="font-semibold">Starting beliefs. </span>{frame.prior.reason}
          </p>
        );
      case "alarm":
        return (
          <p className="text-sm">
            <span className="font-semibold">Alarm: </span>
            overall vibration {um(frame.alarm.overall_rms_um)} RMS at{" "}
            {rpm(frame.alarm.rpm)} and {newtons(frame.alarm.load_n)}. Only this single number is
            known so far.
          </p>
        );
      case "choice": {
        const c = frame.candidate;
        return (
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              Experiment {frame.step}: {rpm(c.rpm)}, {newtons(c.load_n)} (cost {c.cost})
            </p>
            <p className="text-xs text-slate-500">
              Chosen by {plannerName(frame.chosen_by)}
              {frame.information_bits !== null && (
                <> · expected information {frame.information_bits.toFixed(2)} bits</>
              )}
            </p>
            <p className="mt-1 text-sm">{frame.rationale}</p>
          </div>
        );
      }
      case "predict": {
        const hypotheses = Object.keys(frame.predictions);
        return (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Engine predictions before the run:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1 pr-3">Hypothesis</th>
                    <th className="pr-3">1x</th>
                    <th className="pr-3">2x</th>
                    <th className="pr-3">Temp. rise</th>
                  </tr>
                </thead>
                <tbody>
                  {hypotheses.map((h) => {
                    const p = frame.predictions[h];
                    return (
                      <tr key={h} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="py-1 pr-3">{hypothesisName(h)}</td>
                        <td className="pr-3 font-mono tabular-nums">{um(p.amp_1x_um)}</td>
                        <td className="pr-3 font-mono tabular-nums">{um(p.amp_2x_um)}</td>
                        <td className="pr-3 font-mono tabular-nums">{celsius(p.temp_rise_c)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      }
      case "result": {
        const s = frame.step;
        return (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1 pr-3">Hypothesis</th>
                    <th className="pr-3">1x</th>
                    <th className="pr-3">2x</th>
                    <th className="pr-3">Temp. rise</th>
                    <th className="pr-3">Pred.</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(s.predictions).map((h) => {
                    const p = s.predictions[h];
                    return (
                      <tr key={h} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="py-1 pr-3">{hypothesisName(h)}</td>
                        <td className="pr-3 font-mono tabular-nums">{um(p.amp_1x_um)}</td>
                        <td className="pr-3 font-mono tabular-nums">{um(p.amp_2x_um)}</td>
                        <td className="pr-3 font-mono tabular-nums">{celsius(p.temp_rise_c)}</td>
                        <td className="pr-3 font-mono tabular-nums text-slate-500">—</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-slate-400 font-semibold">
                    <td className="py-1 pr-3">Measured</td>
                    <td className="pr-3 font-mono tabular-nums">{um(s.measured.amp_1x_um)}</td>
                    <td className="pr-3 font-mono tabular-nums">{um(s.measured.amp_2x_um)}</td>
                    <td className="pr-3 font-mono tabular-nums">{celsius(s.measured.temp_rise_c)}</td>
                    <td className="pr-3" />
                  </tr>
                </tbody>
              </table>
            </div>
            <SpectrumChart
              freq={s.signals.spectrum_freq_hz}
              amp={s.signals.spectrum_amp_um}
              rpm={s.rpm}
            />
          </div>
        );
      }
      case "update":
        return <p className="text-sm">Beliefs updated — see the probabilities panel.</p>;
      case "diagnosis":
      case "trace":
        return null;
    }
  }
}
