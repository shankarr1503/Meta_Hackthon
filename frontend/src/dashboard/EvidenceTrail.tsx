import type { Probabilities, Step } from "../api/types";
import { celsius, hypothesisName, newtons, plannerName, probability, rpm, um } from "../format";
import { largestRise, posteriorBefore } from "../state/player";

interface Props {
  /** Experiments in order, each with its measurement and the posterior after it. */
  steps: Step[];
  /** Engine probabilities after the alarm, before the first experiment. */
  alarmPosterior: Probabilities;
  /** The diagnosed hypothesis, whose probability is traced through every step. */
  top: string;
}

/**
 * How the evidence built up: each experiment's readings, the hypothesis it lifted most and
 * where the final diagnosis stood after it. Display only: every number is in the trace.
 */
export default function EvidenceTrail({ steps, alarmPosterior, top }: Props) {
  if (steps.length === 0) return null;
  return (
    <section aria-label="Evidence trail" className="text-sm">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        How the evidence built up
      </h4>
      <ol className="mt-2 space-y-2">
        {steps.map((s, position) => {
          const before = posteriorBefore(steps, position, alarmPosterior);
          const riser = largestRise(Object.keys(s.posterior), { before, after: s.posterior });
          return (
            <li
              key={s.index}
              className="rounded border border-slate-200 p-2 dark:border-slate-800"
            >
              <p className="font-medium">
                Experiment {s.index}: {rpm(s.rpm)}, {newtons(s.load_n)}{" "}
                <span className="text-xs font-normal text-slate-500">
                  · chosen by {plannerName(s.chosen_by)}
                </span>
              </p>
              <p className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                1x {um(s.measured.amp_1x_um)} · 2x {um(s.measured.amp_2x_um)} · broadband{" "}
                {um(s.measured.broadband_um)} · temp rise {celsius(s.measured.temp_rise_c)}
              </p>
              <p className="text-xs">
                {riser
                  ? `${hypothesisName(riser)} rose ${probability(before[riser] ?? 0)} → ${probability(s.posterior[riser] ?? 0)}`
                  : "No hypothesis rose visibly"}
                {" · "}
                {hypothesisName(top)} at {probability(s.posterior[top] ?? 0)} after this step
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
