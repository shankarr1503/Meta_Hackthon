import type { Step } from "../api/types";
import { HYPOTHESES, celsius, hypothesisName, um } from "../format";

/**
 * What each hypothesis predicted before the run (engine) and what the Meta model said to
 * expect, with the measurement added only once it is revealed.
 */
export default function PredictionTable({
  step,
  showMeasurement,
}: {
  step: Step;
  showMeasurement: boolean;
}) {
  const expectations = step.expectations ?? {};
  const hasExpectations = Object.keys(expectations).length > 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Predictions versus result</caption>
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th className="py-1 pr-3">Hypothesis</th>
            <th className="pr-3">1x</th>
            <th className="pr-3">2x</th>
            <th className="pr-3">Temp. rise</th>
            {hasExpectations && <th>Meta model expects</th>}
          </tr>
        </thead>
        <tbody>
          {HYPOTHESES.map((h) => {
            const p = step.predictions[h];
            return (
              <tr key={h} className="border-t border-slate-200 dark:border-slate-800">
                <td className="py-1 pr-3">{hypothesisName(h)}</td>
                <td className="pr-3 font-mono tabular-nums">{um(p.amp_1x_um)}</td>
                <td className="pr-3 font-mono tabular-nums">{um(p.amp_2x_um)}</td>
                <td className="pr-3 font-mono tabular-nums">{celsius(p.temp_rise_c)}</td>
                {hasExpectations && (
                  <td className="text-slate-600 dark:text-slate-400">{expectations[h] ?? "—"}</td>
                )}
              </tr>
            );
          })}
          <tr
            className="border-t-2 border-slate-400 font-semibold"
            data-testid="measured-row"
          >
            <td className="py-1 pr-3">Measured</td>
            {showMeasurement ? (
              <>
                <td className="pr-3 font-mono tabular-nums">{um(step.measured.amp_1x_um)}</td>
                <td className="pr-3 font-mono tabular-nums">{um(step.measured.amp_2x_um)}</td>
                <td className="pr-3 font-mono tabular-nums">
                  {celsius(step.measured.temp_rise_c)}
                </td>
              </>
            ) : (
              <td colSpan={3} className="font-normal italic text-slate-500">
                Not yet revealed
              </td>
            )}
            {hasExpectations && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
