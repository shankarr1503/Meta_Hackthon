import type { Step } from "../api/types";
import { celsius, newtons, plannerName, rpm, um } from "../format";

/** Experiments whose measurements have been revealed, in order. */
export default function ExperimentLog({ steps }: { steps: Step[] }) {
  if (steps.length === 0) {
    return <p className="text-sm text-slate-500">No experiments run yet.</p>;
  }
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Experiment log</caption>
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th className="py-1 pr-3">#</th>
            <th className="pr-3">Speed</th>
            <th className="pr-3">Load</th>
            <th className="pr-3">Cost</th>
            <th className="pr-3">1x</th>
            <th className="pr-3">2x</th>
            <th className="pr-3">Broadband</th>
            <th className="pr-3">Temp. rise</th>
            <th>Chosen by</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {steps.map((s) => (
            <tr key={s.index} className="border-t border-slate-200 dark:border-slate-800">
              <td className="py-1 pr-3">{s.index}</td>
              <td className="pr-3">{rpm(s.rpm)}</td>
              <td className="pr-3">{newtons(s.load_n)}</td>
              <td className="pr-3">{s.cost}</td>
              <td className="pr-3">{um(s.measured.amp_1x_um)}</td>
              <td className="pr-3">{um(s.measured.amp_2x_um)}</td>
              <td className="pr-3">{um(s.measured.broadband_um)}</td>
              <td className="pr-3">{celsius(s.measured.temp_rise_c)}</td>
              <td className="font-sans">{plannerName(s.chosen_by)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
