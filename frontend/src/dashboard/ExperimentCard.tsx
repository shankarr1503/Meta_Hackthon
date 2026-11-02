import type { Measured, Prediction, Signals } from "../api/types";
import { hypothesisName, newtons, orderedHypotheses, plannerName, rpm } from "../format";
import type { Experiment, ProbabilityChange } from "../state/player";
import PredictionTable from "./PredictionTable";
import SpectrumChart from "./SpectrumChart";

interface Props {
  experiment: Experiment;
  /** Engine predictions; null while only the choice is shown. */
  predictions: Record<string, Prediction> | null;
  /** Revealed measurement and its spectrum; null until the result is shown. */
  measured: Measured | null;
  signals: Signals | null;
  /** Probabilities before and after; null until the update is shown. */
  change: ProbabilityChange | null;
}

function MetaExpectations({ expectations }: { expectations: Record<string, string> }) {
  return (
    <div className="text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Meta model expects (stated before the run)
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {orderedHypotheses(Object.keys(expectations)).map((h) => (
          <li key={h}>
            <span className="font-medium">{hypothesisName(h)}:</span> {expectations[h]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The experiment being presented: choice and reasoning, then predictions, result and update. */
export default function ExperimentCard({ experiment, predictions, measured, signals, change }: Props) {
  const e = experiment;
  const stated = e.expectations && Object.keys(e.expectations).length > 0 ? e.expectations : null;
  return (
    <div className="space-y-3">
      <div className="text-sm">
        <p className="font-semibold">
          Experiment {e.index}: {rpm(e.rpm)}, {newtons(e.load_n)} (cost {e.cost})
        </p>
        <p className="text-xs text-slate-500">
          Chosen by {plannerName(e.chosen_by)}
          {e.information_bits !== null &&
            ` · expected information ${e.information_bits.toFixed(2)} bits`}
        </p>
        <p className="mt-1">{e.rationale}</p>
      </div>
      {predictions === null && stated && <MetaExpectations expectations={stated} />}
      {predictions !== null && (
        <PredictionTable
          index={e.index}
          predictions={predictions}
          expectations={e.expectations}
          measured={measured}
          change={change}
        />
      )}
      {measured !== null && signals !== null && (
        <SpectrumChart freq={signals.spectrum_freq_hz} amp={signals.spectrum_amp_um} rpm={e.rpm} />
      )}
    </div>
  );
}
