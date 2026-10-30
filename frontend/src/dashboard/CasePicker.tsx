import { useState } from "react";

import type { CaseView, PlannerName, TraceSummary } from "../api/types";
import { count, hypothesisName, percent, plannerName } from "../format";

const PLANNERS: PlannerName[] = ["meta", "info_gain", "sweep", "random"];

interface Props {
  cases: CaseView[];
  replays: TraceSummary[];
  metaConfigured: boolean;
  busy: boolean;
  onRun: (caseId: string, planner: PlannerName, seed: number) => void;
  onOpenReplay: (id: string) => void;
}

export default function CasePicker({
  cases,
  replays,
  metaConfigured,
  busy,
  onRun,
  onOpenReplay,
}: Props) {
  const [planner, setPlanner] = useState<PlannerName>(metaConfigured ? "meta" : "info_gain");
  const [seed, setSeed] = useState(0);
  const metaUnavailable = planner === "meta" && !metaConfigured;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1">
          Investigator
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            value={planner}
            onChange={(e) => setPlanner(e.target.value as PlannerName)}
          >
            {PLANNERS.map((p) => (
              <option key={p} value={p}>
                {plannerName(p)}
                {p === "meta" && !metaConfigured ? " (not configured)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Seed
          <input
            type="number"
            min={0}
            max={10000}
            className="w-24 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            value={seed}
            onChange={(e) => setSeed(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))}
          />
        </label>
        {metaUnavailable && (
          <p role="note" className="text-amber-700 dark:text-amber-400">
            The Meta model is not configured on the backend; choose another investigator.
          </p>
        )}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Cases">
        {cases.map((c) => (
          <li
            key={c.case_id}
            className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <h3 className="font-semibold">{c.title}</h3>
              <p className="font-mono text-xs text-slate-500">{c.case_id}</p>
              <p className="mt-2 text-sm italic">“{c.note}”</p>
            </div>
            <button
              type="button"
              disabled={busy || metaUnavailable}
              onClick={() => onRun(c.case_id, planner, seed)}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              Investigate {c.title}
            </button>
          </li>
        ))}
      </ul>

      <section aria-labelledby="replays-heading">
        <h3 id="replays-heading" className="mb-2 font-semibold">
          Saved replays
        </h3>
        {replays.length === 0 ? (
          <p className="text-sm text-slate-500">No saved investigations yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {replays.map((r) => (
              <li key={r.investigation_id} className="flex items-center justify-between gap-3 py-1.5">
                <span>
                  {r.demo && (
                    <span className="mr-2 rounded bg-indigo-100 px-1.5 text-xs text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100">
                      demo
                    </span>
                  )}
                  <span className="font-mono">{r.investigation_id}</span> ·{" "}
                  {plannerName(r.planner)} → {hypothesisName(r.top)} {percent(r.probability)} in{" "}
                  {count(r.experiments, "experiment")}
                </span>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  onClick={() => onOpenReplay(r.investigation_id)}
                  aria-label={`Open replay ${r.investigation_id}`}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
