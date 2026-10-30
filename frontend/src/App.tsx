import { useEffect, useState } from "react";

import { getHealth } from "./api/client";
import type { HealthResponse } from "./api/types";
import SimulatedLabel from "./SimulatedLabel";

type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; health: HealthResponse }
  | { kind: "error"; message: string };

export default function App() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    getHealth()
      .then((health) => {
        if (active) setState({ kind: "ok", health });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (active) setState({ kind: "error", message });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">FailureLab AI</h1>
          <SimulatedLabel />
        </header>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          A Meta-model investigator for a simulated rotating machine. All data is simulated.
        </p>
        <section
          aria-labelledby="health-heading"
          className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 id="health-heading" className="mb-2 font-semibold">
            Backend health
          </h2>
          <HealthStatus state={state} />
        </section>
      </div>
    </main>
  );
}

function HealthStatus({ state }: { state: HealthState }) {
  if (state.kind === "loading") {
    return <p role="status">Checking backend…</p>;
  }
  if (state.kind === "error") {
    return (
      <p role="alert" className="text-red-700 dark:text-red-400">
        Backend unreachable: {state.message}
      </p>
    );
  }
  const { health } = state;
  return (
    <dl role="status" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-slate-500">Status</dt>
      <dd className="font-mono">{health.status}</dd>
      <dt className="text-slate-500">Service</dt>
      <dd className="font-mono">{health.service}</dd>
      <dt className="text-slate-500">Version</dt>
      <dd className="font-mono">{health.version}</dd>
      <dt className="text-slate-500">Contract</dt>
      <dd className="font-mono">{health.contract_version}</dd>
    </dl>
  );
}
