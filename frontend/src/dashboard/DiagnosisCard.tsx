import type { Diagnosis } from "../api/types";
import { hypothesisName, probability } from "../format";
import SimulatedLabel from "../SimulatedLabel";
import ActionPlan from "./ActionPlan";

const STOP_REASONS: Record<string, string> = {
  confident: "Stopped: the leading hypothesis reached 90%.",
  budget: "Stopped: the experiment budget is spent.",
  no_affordable_experiment: "Stopped: no affordable experiment remains.",
};

export default function DiagnosisCard({
  diagnosis,
  stopReason,
}: {
  diagnosis: Diagnosis;
  stopReason: string;
}) {
  return (
    <section
      aria-labelledby="diagnosis-heading"
      className="space-y-3 rounded-lg border-2 border-slate-900 bg-white p-4 dark:border-slate-300 dark:bg-slate-900"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 id="diagnosis-heading" className="text-lg font-semibold">
          Diagnosis: {hypothesisName(diagnosis.top)}{" "}
          <span className="font-mono">{probability(diagnosis.probability)}</span>
        </h3>
        <SimulatedLabel />
      </header>
      <p className="text-sm">
        {diagnosis.confident ? "Confident (at least 90%)." : "Not confident: below 90%."}{" "}
        {STOP_REASONS[stopReason] ?? ""}
      </p>
      <p className="text-sm leading-relaxed">{diagnosis.explanation}</p>
      <div className="text-sm">
        <h4 className="font-semibold">Remaining doubts</h4>
        {diagnosis.remaining_doubts.length === 0 ? (
          <p>None at 5% or more.</p>
        ) : (
          <ul className="list-inside list-disc">
            {diagnosis.remaining_doubts.map((d) => (
              <li key={d.hypothesis}>
                {hypothesisName(d.hypothesis)}{" "}
                <span className="font-mono">{probability(d.probability)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-sm">
        <span className="font-semibold">Recommended check: </span>
        {diagnosis.recommended_check}
      </p>
      <ActionPlan hypothesis={diagnosis.top} />
    </section>
  );
}
