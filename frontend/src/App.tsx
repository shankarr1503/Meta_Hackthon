import { useCallback, useEffect, useRef, useState } from "react";

import {
  getCase,
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
import VideoIntake from "./video/VideoIntake";

type Tab = "investigate" | "lab" | "benchmark" | "real" | "video";

const TABS: { id: Tab; label: string }[] = [
  { id: "real", label: "Real recordings" },
  { id: "investigate", label: "Investigate" },
  { id: "lab", label: "Manual lab" },
  { id: "benchmark", label: "Benchmark" },
  { id: "video", label: "Video intake" },
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
      className="text-sm text-blue-700 underline dark:text-blue-400"
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
  const [tab, setTab] = useState<Tab>(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    return view === "real" || view === "video" ? view : "investigate";
  });
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

  /** Looks up the public view of a fresh machine, then investigates it live. */
  const onRunFresh = async (machineSeed: number, planner: PlannerName, seed: number) => {
    setBusy(true);
    setError(null);
    try {
      onRun(await getCase(`fresh-${machineSeed}`), planner, seed);
    } catch (e) {
      setBusy(false);
      setError(message(e));
    }
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
            <h1 className="text-[1.7rem] font-semibold tracking-tight">FailureLab AI</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              A Meta-model investigator for rotating machines: it chooses the experiments, states
              what it expects before each result, and explains the diagnosis.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loaded && (
              <span
                className={`rounded-sm border px-2 py-1 text-xs ${
                  loaded.ready.meta_model_configured
                    ? "border-slate-400 bg-slate-100 text-slate-900 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100"
                    : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                }`}
                title={
                  loaded.ready.meta_model_configured
                    ? "The Meta model is configured: live investigations and questions use it."
                    : "No model key on this server: rule planners and saved replays only."
                }
              >
                {loaded.ready.meta_model_configured
                  ? `Meta model ${loaded.ready.meta_model || "configured"} · live`
                  : "Meta model off · baseline planners and replays"}
              </span>
            )}
            {tab === "real" ? (
              <span className="rounded-sm border border-emerald-500 bg-emerald-50 px-2 py-1 text-xs font-semibold uppercase text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                Measured laboratory data
              </span>
            ) : tab === "video" ? (
              <span className="rounded-sm border border-amber-500 bg-amber-50 px-2 py-1 text-xs font-semibold uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Experimental · your video
              </span>
            ) : (
              <SimulatedLabel />
            )}
          </div>
        </header>

        <nav aria-label="Sections" className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${
                tab === t.id
                  ? "border-slate-900 font-semibold text-slate-900 dark:border-slate-100 dark:text-slate-100"
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
        {tab === "video" && (
          <ErrorBoundary label="video intake">
            <VideoIntake metaConfigured={loaded?.ready.meta_model_configured ?? false} />
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
                metaConfigured={loaded?.ready.meta_model_configured ?? false}
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
                <InvestigationView
                  key={trace.investigation_id}
                  trace={trace}
                  metaConfigured={loaded?.ready.meta_model_configured ?? false}
                />
              </div>
            ) : loaded ? (
              <CasePicker
                cases={loaded.cases}
                replays={replays}
                metaConfigured={loaded.ready.meta_model_configured}
                busy={busy}
                onRun={onRun}
                onRunFresh={(machineSeed, planner, seed) => void onRunFresh(machineSeed, planner, seed)}
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
