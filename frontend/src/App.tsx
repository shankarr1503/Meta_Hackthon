import { useCallback, useEffect, useState } from "react";

import {
  getCases,
  getInvestigation,
  getReady,
  listInvestigations,
} from "./api/client";
import type { CaseView, PlannerName, ReadyResponse, Trace, TraceSummary } from "./api/types";
import BenchmarkView from "./benchmark/BenchmarkView";
import CasePicker from "./dashboard/CasePicker";
import InvestigationView from "./dashboard/InvestigationView";
import LiveInvestigationView from "./dashboard/LiveInvestigationView";
import ManualLab from "./lab/ManualLab";
import RealRecordings from "./real/RealRecordings";
import SimulatedLabel from "./SimulatedLabel";

type Tab = "investigate" | "lab" | "benchmark" | "real";

const TABS: { id: Tab; label: string }[] = [
  { id: "real", label: "Real recordings" },
  { id: "investigate", label: "Investigate" },
  { id: "lab", label: "Manual lab" },
  { id: "benchmark", label: "Benchmark" },
];

interface Loaded {
  ready: ReadyResponse;
  cases: CaseView[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [tab, setTab] = useState<Tab>(new URLSearchParams(window.location.search).get("view") === "real" ? "real" : "investigate");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [replays, setReplays] = useState<TraceSummary[]>([]);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [live, setLive] = useState<{
    caseId: string;
    caseTitle: string;
    caseNote: string;
    planner: PlannerName;
    seed: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshReplays = useCallback(() => {
    listInvestigations()
      .then(setReplays)
      .catch(() => setReplays([]));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getReady(), getCases()])
      .then(([ready, cases]) => {
        if (active) setLoaded({ ready, cases });
      })
      .catch((e: unknown) => {
        if (active) setError(`Backend unreachable: ${message(e)}`);
      });
    refreshReplays();
    return () => {
      active = false;
    };
  }, [refreshReplays]);

  const open = async (load: () => Promise<Trace>) => {
    setBusy(true);
    setError(null);
    try {
      setTrace(await load());
      refreshReplays();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const onRun = (
    caseView: CaseView,
    planner: PlannerName,
    seed: number,
  ) => {
    setBusy(false);
    setError(null);
    setTrace(null);
    setLive({
      caseId: caseView.case_id,
      caseTitle: caseView.title,
      caseNote: caseView.note,
      planner,
      seed,
    });
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">FailureLab AI</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              A Meta-model investigator for rotating machines. Explore real recordings and simulated experiments.
            </p>
          </div>
          {tab === "real" ? <span className="rounded border border-emerald-500 bg-emerald-50 px-2 py-1 text-xs font-semibold uppercase text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Measured laboratory data</span> : <SimulatedLabel />}
        </header>

        <nav aria-label="Sections" className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                tab === t.id
                  ? "border-indigo-600 font-semibold text-indigo-700 dark:text-indigo-300"
                  : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "real" && <RealRecordings />}
        {tab === "lab" && <ManualLab />}
        {tab === "benchmark" && <BenchmarkView />}

        {tab === "investigate" && error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}
        {tab === "investigate" && busy && (
          <p role="status">Running the simulated investigation…</p>
        )}

        {tab !== "investigate" ? null : live ? (
          <LiveInvestigationView
            caseId={live.caseId}
            caseTitle={live.caseTitle}
            caseNote={live.caseNote}
            planner={live.planner}
            seed={live.seed}
          />
        ) : trace ? (
          <div className="space-y-4">
            <button
              type="button"
              className="text-sm text-indigo-700 underline dark:text-indigo-300"
              onClick={() => setTrace(null)}
            >
              ← Back to cases
            </button>
            <InvestigationView key={trace.investigation_id} trace={trace} />
          </div>
        ) : loaded ? (
          <CasePicker
            cases={loaded.cases}
            replays={replays}
            metaConfigured={loaded.ready.meta_model_configured}
            busy={busy}
            onRun={onRun}
            onOpenReplay={(id) => open(() => getInvestigation(id))}
          />
        ) : (
          !error && <p role="status">Loading cases…</p>
        )}
      </div>
    </main>
  );
}
