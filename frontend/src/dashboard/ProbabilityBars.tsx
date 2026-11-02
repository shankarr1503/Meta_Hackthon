import type { Probabilities } from "../api/types";
import { HYPOTHESES, hypothesisName, percent } from "../format";

const TARGET = 0.9;

/** One bar per hypothesis with its probability as a number; the 90% stop line is marked. */
export default function ProbabilityBars({ probabilities }: { probabilities: Probabilities }) {
  const top = Math.max(...HYPOTHESES.map((h) => probabilities[h] ?? 0));
  return (
    <ul aria-label="Hypothesis probabilities" className="space-y-2">
      {HYPOTHESES.map((h) => {
        const p = probabilities[h] ?? 0;
        const leading = p === top;
        return (
          <li key={h} className="grid grid-cols-[minmax(0,9rem)_minmax(1rem,1fr)_3rem] items-center gap-2 text-sm sm:grid-cols-[11rem_minmax(1rem,1fr)_4rem] sm:gap-3">
            <span className={leading ? "font-semibold" : undefined}>{hypothesisName(h)}</span>
            <span
              className="relative h-3 overflow-hidden rounded bg-slate-200 dark:bg-slate-800"
              role="meter"
              aria-label={hypothesisName(h)}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={p}
              aria-valuetext={percent(p)}
            >
              <span
                className={`absolute inset-y-0 left-0 rounded transition-[width] duration-700 ${
                  leading ? "bg-indigo-600 dark:bg-indigo-400" : "bg-slate-400 dark:bg-slate-500"
                }`}
                style={{ width: `${(p * 100).toFixed(2)}%` }}
              />
              <span
                aria-hidden
                className="absolute inset-y-0 w-px bg-slate-900/60 dark:bg-white/60"
                style={{ left: `${TARGET * 100}%` }}
              />
            </span>
            <span className="text-right font-mono tabular-nums">{percent(p)}</span>
          </li>
        );
      })}
    </ul>
  );
}
