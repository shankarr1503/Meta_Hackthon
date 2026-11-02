import { useCallback, useEffect, useRef, useState } from "react";

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
import ErrorBoundary from "./ErrorBoundary";
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

/** One live investigation; `runId` is new for every run, so each run gets a fresh view. */
interface LiveRun {
  runId: number;
  caseView: CaseView;
  planner: PlannerName;
  seed: number;
}

function BackToCases({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="text-sm text-indigo-700 underline dark:text-indigo-300"
      onClick={onClick}
    >
      ← Back to cases
    </button>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [tab, setTab] = useState<Tab>(new URLSearchParams(window.location.search).get("view") === "real" ? "real" : "investigate");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [replays, setReplays] = useState<TraceSummary[]>([]);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [live, setLive] = useState<LiveRun | null>(null);
  const runs = useRef(0);
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

  const onRun = (caseView: CaseView, planner: PlannerName, seed: number) => {
    runs.current += 1;
    setBusy(false);
    setError(null);
    setTrace(null);
    setLive({ runId: runs.current, caseView, planner, seed });
  };

  /** Leaves a live run (closing its stream) or a replay, and lists the saved replays again. */
  const backToCases = () => {
    setLive(null);
    setTrace(null);
    refreshReplays();
  };

  const openLiveReplay = (finished: Trace) => {
    setLive(null);
    setTrace(finished);
    refreshReplays();
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

        {tab === "real" && (
          <ErrorBoundary label="real recordings">
            <RealRecordings />
          </ErrorBoundary>
        )}
        {tab === "lab" && (
          <ErrorBoundary label="manual lab">
            <ManualLab />
          </ErrorBoundary>
        )}
        {tab === "benchmark" && (
          <ErrorBoundary label="benchmark">
            <BenchmarkView />
          </ErrorBoundary>
        )}

        {live && (
          // Stays mounted (only hidden) on other tabs, so switching tabs never restarts the
          // stream, which would start a new investigation and new Meta model calls.
          <div hidden={tab !== "investigate"} className="space-y-4">
            <BackToCases onClick={backToCases} />
            <ErrorBoundary key={live.runId} label="live investigation">
              <LiveInvestigationView
                caseView={live.caseView}
                planner={live.planner}
                seed={live.seed}
                onOpenReplay={openLiveReplay}
              />
            </ErrorBoundary>
          </div>
        )}

        {tab === "investigate" && !live && (
          <ErrorBoundary key={trace?.investigation_id ?? "cases"} label="investigation">
            {error && (
              <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                {error}
              </p>
            )}
            {busy && <p role="status">Running the simulated investigation…</p>}
            {trace ? (
              <div className="space-y-4">
                <BackToCases onClick={backToCases} />
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
          </ErrorBoundary>
        )}
      </div>
    </main>
  );
}
