import { useState } from "react";

import type { ProofReport } from "../api/types";
import Panel from "../dashboard/Panel";
import { count, hypothesisName, percent } from "../format";

const NAMES: Record<string, string> = {
  no_history: "No maintenance history",
  misleading: "Misleading maintenance note",
  injection: "Instruction injection in note",
};

function firstCondition(report: ProofReport): string {
  const keys = Object.keys(report.conditions);
  return keys.includes("no_history") ? "no_history" : (keys[0] ?? "");
}

export default function ProofPanel({ report }: { report: ProofReport }) {
  const [condition, setCondition] = useState(() => firstCondition(report));
  const result = report.conditions[condition];
  if (!result) return null;
  const [low, high] = result.paired_cost_saved_ci95;
  const conditions = Object.keys(report.conditions).length;
  const confidentErrors = result.meta.confident_errors;
  return (
    <Panel title="Proof of concept: challenge evidence">
      <p className="mb-3 text-sm">
        {report.machines} newly generated simulated machines. {report.paired_runs} paired
        investigations across {count(conditions, "note condition")}. Meta and information gain
        receive the same machine, alarm, sensor-noise seed and experiment budget. Model:{" "}
        {report.model}.
      </p>
      <label className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        Challenge condition
        <select
          className="max-w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
          value={condition}
          onChange={e => setCondition(e.target.value)}
        >
          {Object.keys(report.conditions).map(key => (
            <option key={key} value={key}>{NAMES[key] ?? key}</option>
          ))}
        </select>
      </label>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Challenge results: {NAMES[condition] ?? condition}</caption>
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="pr-4">Investigator</th><th className="pr-4">Correct</th>
              <th className="pr-4">Accuracy (95% interval)</th>
              <th className="pr-4">Mean points</th><th className="pr-4">Mean time</th>
              <th>Fallback calls</th>
            </tr>
          </thead>
          <tbody>
            {(["meta", "info_gain"] as const).map(name => {
              const m = result[name];
              return (
                <tr key={name} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-2 pr-4">{name === "meta" ? "Meta model" : "Information gain"}</td>
                  <td className="pr-4">{m.correct}/{m.runs}</td>
                  <td className="pr-4 whitespace-nowrap">
                    {percent(m.accuracy)} ({percent(m.accuracy_ci95[0])} to {percent(m.accuracy_ci95[1])})
                  </td>
                  <td className="pr-4">{m.mean_cost.toFixed(2)}</td>
                  <td className="pr-4">{m.mean_latency_s.toFixed(1)} s</td>
                  <td>{m.calls ? `${m.fallbacks}/${m.calls}` : "No model calls"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">
        Paired experiment points saved by Meta: {result.paired_cost_saved.toFixed(2)};
        95% bootstrap interval {low.toFixed(2)} to {high.toFixed(2)}.
        {low <= 0 && high >= 0 && " This sample does not establish a cost advantage."}
        {condition === "injection" && ` Injection marker in final explanations: ${result.meta.injection_marker_in_explanation}/${result.meta.runs}.`}
      </p>
      <p className="mt-2 text-sm">
        Wrong Meta diagnoses above 90% confidence:{" "}
        {confidentErrors ?? "not recorded"}.
      </p>
      {report.runs && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">Inspect every paired result</summary>
          <p className="my-2">True labels below are revealed for retrospective scoring only.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Per-machine challenge audit</caption>
              <thead><tr>
                <th className="pr-3">Machine</th><th className="pr-3">True fault</th>
                <th className="pr-3">Meta diagnosis</th><th className="pr-3">Baseline diagnosis</th>
                <th className="pr-3">Points: Meta / baseline</th><th>Meta fallbacks</th>
              </tr></thead>
              <tbody>
                {report.runs.filter(run => run.condition === condition).map(run => (
                  <tr key={run.case_id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="py-2 pr-3 font-mono">{run.case_id}</td>
                    <td className="pr-3">{hypothesisName(run.truth)}</td>
                    <td className="pr-3">{hypothesisName(run.meta.top)} ({percent(run.meta.probability)}){!run.meta.correct && " — incorrect"}</td>
                    <td className="pr-3">{hypothesisName(run.info_gain.top)}{!run.info_gain.correct && " — incorrect"}</td>
                    <td className="pr-3">{run.meta.cost} / {run.info_gain.cost}</td>
                    <td>{run.meta.fallbacks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium">Protocol and limits</summary>
        <ul className="my-3 list-disc space-y-1 pl-5">
          {report.limitations.map(limit => <li key={limit}>{limit}</li>)}
        </ul>
        <p>Accuracy uses Wilson intervals; cost intervals resample paired machines within each condition.</p>
        <p className="mt-2 break-all font-mono text-xs">Frozen plan SHA-256: {report.plan_sha256}</p>
      </details>
      <a className="mt-4 inline-block text-sm text-indigo-700 underline dark:text-indigo-300" href="/api/proof/download" download>
        Download all results and model evidence (JSON)
      </a>
    </Panel>
  );
}
