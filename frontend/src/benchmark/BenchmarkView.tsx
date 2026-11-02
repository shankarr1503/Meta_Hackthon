import { useEffect, useState } from "react";

import { ApiError, getBenchmark } from "../api/client";
import type { BenchmarkResult, PlannerMetrics } from "../api/types";
import Panel from "../dashboard/Panel";
import { hypothesisName, percent, plannerName } from "../format";
import SimulatedLabel from "../SimulatedLabel";
import { casesLabel } from "./cases";
import ProofPanel from "./ProofPanel";

const PLANNER_ORDER = ["meta", "info_gain_meta_cases", "info_gain", "sweep", "random"];
function groupLabel(group: string): string {
  if (group === "all") return "All runs";
  if (group === "sealed") return "Sealed cases";
  if (group === "generated") return "Generated cases";
  return hypothesisName(group.replace("truth:", ""));
}

function optionalPercent(value: number | null): string {
  return value === null ? "—" : percent(value);
}

function Row({
  planner,
  m,
  protocol,
}: {
  planner: string;
  m: PlannerMetrics;
  protocol: Record<string, unknown> | undefined;
}) {
  const runtime = protocol?.runtime_s;
  return (
    <tr className="border-t border-slate-200 dark:border-slate-800">
      <td className="py-1 pr-3 font-sans">{plannerName(planner)}</td>
      <td className="pr-3 font-sans text-xs">{casesLabel(protocol)}</td>
      <td className="pr-3">{m.runs}</td>
      <td className="pr-3">{percent(m.accuracy)}</td>
      <td className="pr-3">{m.mean_cost.toFixed(2)}</td>
      <td className="pr-3">{m.mean_experiments.toFixed(2)}</td>
      <td className="pr-3">{percent(m.reached_target)}</td>
      <td className="pr-3">{optionalPercent(m.accuracy_when_confident)}</td>
      <td className="pr-3">{optionalPercent(m.fallback_rate)}</td>
      <td>{typeof runtime === "number" ? `${runtime.toFixed(1)} s` : "—"}</td>
    </tr>
  );
}

export default function BenchmarkView() {
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState("all");

  useEffect(() => {
    let active = true;
    getBenchmark()
      .then((r) => active && setResult(r))
      .catch((e: unknown) => {
        if (!active) return;
        setError(
          e instanceof ApiError && e.status === 404
            ? "No benchmark yet. Run python scripts/tasks.py benchmark."
            : e instanceof Error
              ? e.message
              : String(e),
        );
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!result) return <p role="status">Loading benchmark…</p>;

  const planners = [
    ...PLANNER_ORDER.filter((p) => p in result.planners),
    ...Object.keys(result.planners).filter((p) => !PLANNER_ORDER.includes(p)),
  ];
  const groups = Array.from(new Set(planners.flatMap((p) => Object.keys(result.planners[p]))));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Benchmark</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Every planner gets the same budget ({result.rules.budget} points) and stops at{" "}
            {percent(result.rules.confidence_target, 0)}. Cases are simulated with the model family
            the engine assumes, so this measures the method, not real-world accuracy. Generated{" "}
            {result.generated_at}, physics model {result.model_version}.
          </p>
        </div>
        <SimulatedLabel />
      </header>

      {result.proof && <ProofPanel report={result.proof} />}
      <Panel title="Planner comparison">
        <label className="mb-3 flex items-center gap-2 text-sm">
          Cases
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g} value={g}>
                {groupLabel(g)}
              </option>
            ))}
          </select>
        </label>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Benchmark results for {groupLabel(group)}</caption>
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-3">Planner</th>
                <th className="pr-3">Cases</th>
                <th className="pr-3">Runs</th>
                <th className="pr-3">Accuracy</th>
                <th className="pr-3">Mean cost</th>
                <th className="pr-3">Mean experiments</th>
                <th className="pr-3">Reached 90%</th>
                <th className="pr-3">Accuracy when 90% sure</th>
                <th className="pr-3">Model fallback rate</th>
                <th>Runtime</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {planners
                .filter((p) => result.planners[p][group])
                .map((p) => (
                  <Row
                    key={p}
                    planner={p}
                    m={result.planners[p][group]}
                    protocol={result.protocols[p]}
                  />
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Rows that cover different runs are not directly comparable: compare the Meta model with
          “{plannerName("info_gain_meta_cases")}”, which runs on exactly the same cases and seeds.
        </p>
        {!("meta" in result.planners) && (
          <p className="mt-3 text-sm text-slate-500">
            The Meta model has not been benchmarked yet (run{" "}
            <code>python scripts/tasks.py benchmark-meta</code> with the model configured).
          </p>
        )}
      </Panel>
    </div>
  );
}
