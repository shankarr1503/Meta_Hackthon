import { useEffect, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import Panel from "../dashboard/Panel";
import type { RealReport } from "./types";

const LABELS: Record<string, string> = {
  normal: "Normal", unbalance: "Unbalance", misalignment: "Misalignment",
  looseness: "Mechanical looseness", unknown: "Undetermined",
};
const CHANNELS = ["Pulley side · vertical", "Pulley side · horizontal",
  "Disc side · vertical", "Disc side · horizontal"];

export default function RealRecordings() {
  const [report, setReport] = useState<RealReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [channel, setChannel] = useState(0);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/real-recordings").then(async response => {
      if (!response.ok) throw new Error("Real recording evidence is unavailable on this server.");
      return response.json() as Promise<RealReport>;
    }).then(data => { if (active) setReport(data); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!report) return <p role="status">Loading real machine recordings…</p>;
  const records = report.records.filter(r => r.split === "held_out");
  const record = records[selected] ?? records[0];
  const reading = record?.channels[channel] ?? record?.channels[0];
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-semibold">Real machine recordings</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Recorded accelerometer signals from a physical motor, belt and rotor test rig.
          Faults were introduced in a laboratory. These are recorded measurements, not a live machine connection.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="The actual test rig">
          <img src="/api/real-recordings/photo" alt="The dataset authors’ physical motor, belt and rotor test bench"
            className="max-h-64 w-full rounded object-contain" />
          <p className="mt-3 text-xs text-slate-500">
            Data and photograph: {report.dataset.attribution}.{" "}
            <a className="underline" href={report.dataset.dataset_url} target="_blank" rel="noreferrer">Original dataset</a>
            {" · "}<a className="underline" href={report.dataset.license_url} target="_blank" rel="noreferrer">{report.dataset.license}</a>.
            Signals analysed and reduced to plot previews by FailureLab.
          </p>
        </Panel>
        <Panel title="Real-data evaluation">
          <p className="text-sm">{report.reference_trials} labelled reference trials; {report.held_out_trials} separate held-out trials.
            One {report.duration_s}-second window per trial. Four sensors at {report.sample_rate_hz.toLocaleString()} Hz;
            approximately {report.shaft_rpm_approximate} RPM.</p>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div><dt className="text-sm text-slate-500">Meta correct</dt>
              <dd className="text-2xl font-semibold">{report.meta_correct === null ? "Not assessed" : `${report.meta_correct}/${report.held_out_trials}`}</dd></div>
            <div><dt className="text-sm text-slate-500">Reference-distance baseline</dt>
              <dd className="text-2xl font-semibold">{report.baseline_correct}/{report.held_out_trials}</dd></div>
          </dl>
          {report.meta_accuracy_ci95 && <p className="mt-3 text-sm">Meta accuracy 95% interval:
            {" "}{(report.meta_accuracy_ci95[0] * 100).toFixed(1)}% to {(report.meta_accuracy_ci95[1] * 100).toFixed(1)}%.</p>}
          <p className="mt-2 text-xs text-slate-500">Small, single-rig evaluation. Baseline uses all sensors;
            Meta may inspect fewer. This is not evidence of industrial reliability or a controlled superiority claim.</p>
          {report.superseded_study && (
            <p className="mt-2 text-xs text-slate-500">
              Study {report.study_version ?? "real-2"} estimates each recording's shaft speed
              ({report.shaft_rpm_estimated_range
                ? `${Math.round(report.shaft_rpm_estimated_range[0])}–${Math.round(report.shaft_rpm_estimated_range[1])} RPM`
                : "per recording"}
              ). The earlier study {report.superseded_study.version} assumed{" "}
              {report.shaft_rpm_documented ?? 1238} RPM, which misplaced the harmonic bands; it scored Meta{" "}
              {report.superseded_study.meta_correct ?? "—"}/{report.superseded_study.held_out_trials}, baseline{" "}
              {report.superseded_study.baseline_correct}/{report.superseded_study.held_out_trials}, and is kept as superseded.
            </p>
          )}
        </Panel>
      </div>
      {!record || !reading ? (
        <p className="text-sm">This report contains no held-out recordings to show.</p>
      ) : <>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex flex-col gap-1">Held-out recording
          <select aria-label="Held-out recording" value={selected} onChange={e => { setSelected(Number(e.target.value)); setRevealed(false); setChannel(0); }}
            className="max-w-full rounded border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            {records.map((r, i) => <option key={r.id} value={i}>{r.id}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Measured sensor
          <select aria-label="Measured sensor" value={channel} onChange={e => setChannel(Number(e.target.value))}
            className="max-w-full rounded border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            {CHANNELS.map((name, i) => <option key={name} value={i}>{i + 1}: {name}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500">Amplitude: {report.amplitude_units}. No simulated displacement or temperature is shown.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Measured waveform · first 50 ms">
          <div className="h-56" role="img" aria-label="Real accelerometer waveform">
            <ResponsiveContainer width="100%" height="100%"><LineChart data={reading.waveform} margin={{ right: 15 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="time_ms" type="number" unit=" ms" tick={{ fontSize: 10 }} />
              <YAxis width={50} tick={{ fontSize: 10 }} /><Tooltip />
              <Line dataKey="amplitude" stroke="#6366f1" dot={false} isAnimationActive={false} />
            </LineChart></ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Measured spectrum · 0–1,000 Hz">
          <div className="h-56" role="img" aria-label="Real accelerometer frequency spectrum">
            <ResponsiveContainer width="100%" height="100%"><LineChart data={reading.spectrum} margin={{ right: 15 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="frequency_hz" type="number" unit=" Hz" tick={{ fontSize: 10 }} />
              <YAxis width={50} tick={{ fontSize: 10 }} /><Tooltip />
              <Line dataKey="amplitude" stroke="#0d9488" dot={false} isAnimationActive={false} />
            </LineChart></ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <Panel title="Measured features">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Object.entries(reading.features).map(([name, value]) => <div key={name}>
            <dt className="text-xs text-slate-500">{name.replaceAll("_", " ")}</dt>
            <dd className="font-mono text-sm">{value.toPrecision(5)}</dd>
          </div>)}
        </dl>
      </Panel>
      <Panel title="Recorded Meta investigation">
        {record.meta ? <>
          <p className="font-semibold">Assessment: {LABELS[record.meta.label] ?? record.meta.label}</p>
          <p className="mt-2 text-sm">{record.meta.reason}</p>
          <p className="mt-2 text-xs text-slate-500">Model: {report.model}. This is a recorded model assessment;
            no calibrated confidence probability is claimed.</p>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm">
            {record.meta.events.map((event, i) => <li key={i}>
              <span className="font-medium">{event.action === "inspect" ? `Inspect sensor ${(event.channel ?? 0) + 1}` : event.action === "diagnose" ? "State assessment" : "Model error"}: </span>
              {event.reason}
              {event.channel !== undefined && <button type="button" className="ml-2 text-blue-700 underline dark:text-blue-400"
                onClick={() => setChannel(event.channel ?? 0)}>Show sensor {(event.channel ?? 0) + 1}</button>}
            </li>)}
          </ol>
        </> : <p className="text-sm">The real recordings are available; live Meta assessment has not been recorded yet.</p>}
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
          {revealed ? <div className="space-y-2 text-sm">
            <p>Dataset label: <strong>{LABELS[record.label]}</strong></p>
            {record.meta && <p>{record.meta.label === record.label ? "Meta assessment matched the dataset label." : "Meta assessment did not match the dataset label."}</p>}
            <p>Baseline assessment: {LABELS[record.baseline?.label ?? "unknown"]}.</p>
            <p>Source: {record.provenance.archive}, {record.provenance.member}.</p>
            <p className="break-all font-mono text-xs">Recording SHA-256: {record.provenance.recording_sha256}</p>
          </div> : <button type="button" onClick={() => setRevealed(true)}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">Reveal dataset label and source file</button>}
        </div>
      </Panel>
      </>}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">What these real examples establish</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5">{report.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul>
      </details>
    </div>
  );
}
