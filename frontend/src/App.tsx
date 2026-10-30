import { useCallback, useEffect, useState } from "react";

import {
  getCases,
  getInvestigation,
  getReady,
  listInvestigations,
  runInvestigation,
} from "./api/client";
import type { CaseView, PlannerName, ReadyResponse, Trace, TraceSummary } from "./api/types";
import CasePicker from "./dashboard/CasePicker";
import InvestigationView from "./dashboard/InvestigationView";
import SimulatedLabel from "./SimulatedLabel";

interface Loaded {
  ready: ReadyResponse;
  cases: CaseView[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [replays, setReplays] = useState<TraceSummary[]>([]);
  const [trace, setTrace] = useState<Trace | null>(null);
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

  const onRun = (caseId: string, planner: PlannerName, seed: number) =>
    open(() => runInvestigation({ case_id: caseId, planner, seed }));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">FailureLab AI</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              A Meta-model investigator that designs experiments on a simulated rotating machine.
              All data is simulated.
            </p>
          </div>
          <SimulatedLabel />
        </header>

        {error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}
        {busy && <p role="status">Running the simulated investigation…</p>}

        {trace ? (
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
