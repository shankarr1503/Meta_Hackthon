import type { Measured, Prediction } from "../api/types";
import { celsius, hypothesisName, orderedHypotheses, probability, um } from "../format";
import type { ProbabilityChange } from "../state/player";

/** Changes smaller than the 0.1% display resolution read as unchanged. */
const UNCHANGED = 0.0005;

type Direction = "up" | "down" | "same";

function direction(before: number, after: number): Direction {
  if (Math.abs(after - before) < UNCHANGED) return "same";
  return after > before ? "up" : "down";
}

/** The hypothesis whose engine probability rose the most, if any rose visibly. */
function largestRise(hypotheses: string[], change: ProbabilityChange): string | null {
  let best: string | null = null;
  let bestRise = 0;
  for (const h of hypotheses) {
    const rise = (change.after[h] ?? 0) - (change.before[h] ?? 0);
    if (rise >= UNCHANGED && (best === null || rise > bestRise)) {
      best = h;
      bestRise = rise;
    }
  }
  return best;
}

const ARROWS: Record<Direction, { glyph: string; text: string; className: string }> = {
  up: { glyph: "▲", text: "rose", className: "text-emerald-700 dark:text-emerald-400" },
  down: { glyph: "▼", text: "fell", className: "text-rose-700 dark:text-rose-400" },
  same: { glyph: "=", text: "unchanged", className: "text-slate-500" },
};

function ProbabilityCell({ before, after }: { before: number; after: number }) {
  const arrow = ARROWS[direction(before, after)];
  return (
    <td className="whitespace-nowrap pr-3 font-mono tabular-nums">
      {probability(before)} → {probability(after)}{" "}
      <span aria-hidden className={arrow.className}>
        {arrow.glyph}
      </span>
      <span className="sr-only">{arrow.text}</span>
    </td>
  );
}

interface Props {
  /** Experiment number, starting at 1. */
  index: number;
  /** Bayesian-engine predictions per hypothesis, stated before the run. */
  predictions: Record<string, Prediction>;
  /** The Meta model's stated expected result per hypothesis, if it chose this experiment. */
  expectations: Record<string, string> | null;
  /** The simulated measurement; null until it is revealed. */
  measured: Measured | null;
  /** Engine probabilities before and after the update; null until the update is shown. */
  change: ProbabilityChange | null;
}

/**
 * Prediction check for one experiment: what the Meta model said to expect and what the
 * engine predicted for each hypothesis, then the measurement and how each probability moved.
 * Display only: every number comes from the trace or stream.
 */
export default function PredictionTable({ index, predictions, expectations, measured, change }: Props) {
  const stated = expectations ?? {};
  const hasExpectations = Object.keys(stated).length > 0;
  const hypotheses = orderedHypotheses(Object.keys(predictions));
  const riser = change ? largestRise(hypotheses, change) : null;
  const caption = measured
    ? `Prediction check: experiment ${index}`
    : `Predictions before experiment ${index}`;

  return (
    <div className="space-y-1">
      <div className="relative overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="pb-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            {caption}
          </caption>
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1 pr-3">Hypothesis</th>
              <th className="pr-3">1x</th>
              <th className="pr-3">2x</th>
              <th className="pr-3">Temp. rise</th>
              {change && <th className="pr-3">Probability before → after</th>}
              {hasExpectations && <th>Meta model expected</th>}
            </tr>
          </thead>
          <tbody>
            {hypotheses.map((h) => {
              const p = predictions[h];
              const highlighted = h === riser;
              return (
                <tr
                  key={h}
                  className={`border-t border-slate-200 dark:border-slate-800 ${
                    highlighted ? "bg-emerald-50 dark:bg-emerald-950/40" : ""
                  }`}
                >
                  <td className="py-1 pr-3">
                    {hypothesisName(h)}
                    {highlighted && " "}
                    {highlighted && (
                      <span className="ml-1 whitespace-nowrap rounded bg-emerald-100 px-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                        largest rise
                      </span>
                    )}
                  </td>
                  <td className="pr-3 font-mono tabular-nums">{um(p.amp_1x_um)}</td>
                  <td className="pr-3 font-mono tabular-nums">{um(p.amp_2x_um)}</td>
                  <td className="pr-3 font-mono tabular-nums">{celsius(p.temp_rise_c)}</td>
                  {change && (
                    <ProbabilityCell before={change.before[h] ?? 0} after={change.after[h] ?? 0} />
                  )}
                  {hasExpectations && (
                    <td className="min-w-48 text-slate-600 dark:text-slate-400">{stated[h] ?? "—"}</td>
                  )}
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-400 font-semibold" data-testid="measured-row">
              <td className="py-1 pr-3">Measured</td>
              {measured ? (
                <>
                  <td className="pr-3 font-mono tabular-nums">{um(measured.amp_1x_um)}</td>
                  <td className="pr-3 font-mono tabular-nums">{um(measured.amp_2x_um)}</td>
                  <td className="pr-3 font-mono tabular-nums">{celsius(measured.temp_rise_c)}</td>
                </>
              ) : (
                <td colSpan={3} className="font-normal italic text-slate-500">
                  Not yet revealed
                </td>
              )}
              {change && <td />}
              {hasExpectations && <td />}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Rows show the Bayesian engine&apos;s prediction for each hypothesis
        {hasExpectations && "; the Meta model stated its expectations before the run"}.
        Probabilities come only from the engine.
      </p>
    </div>
  );
}
