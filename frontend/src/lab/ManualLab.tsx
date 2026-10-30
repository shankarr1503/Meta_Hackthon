import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { simulateLab } from "../api/client";
import type { LabRequest, LabResult } from "../api/types";
import Panel from "../dashboard/Panel";
import SpectrumChart from "../dashboard/SpectrumChart";
import { celsius, newtons, rpm, um } from "../format";
import SimulatedLabel from "../SimulatedLabel";
import TwinPanel from "../twin/TwinPanel";

const DEBOUNCE_MS = 250;

const INITIAL: LabRequest = {
  imbalance: 0.3,
  misalignment: 0,
  friction: 0,
  rpm: 2950,
  load_n: 500,
  seed: 0,
};

interface SliderSpec {
  key: keyof LabRequest;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: SliderSpec[] = [
  { key: "imbalance", label: "Imbalance", min: 0, max: 1, step: 0.05, format: (v) => v.toFixed(2) },
  { key: "misalignment", label: "Misalignment", min: 0, max: 1, step: 0.05, format: (v) => v.toFixed(2) },
  { key: "friction", label: "Bearing friction", min: 0, max: 1, step: 0.05, format: (v) => v.toFixed(2) },
  { key: "rpm", label: "Speed", min: 0, max: 6000, step: 100, format: rpm },
  { key: "load_n", label: "Load", min: 0, max: 5000, step: 100, format: newtons },
];

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 p-2 dark:border-slate-800">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-mono text-lg tabular-nums">{value}</dd>
    </div>
  );
}

function ResponseCurve({ result, currentRpm }: { result: LabResult; currentRpm: number }) {
  const data = result.curve_rpm.map((r, i) => ({
    rpm: r,
    a1: result.curve_amp_1x_um[i],
    a2: result.curve_amp_2x_um[i],
  }));
  const peak = data.reduce((best, d) => (d.a1 > best.a1 ? d : best), data[0]);
  return (
    <figure className="space-y-1">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="rpm" type="number" domain={[0, 6000]} fontSize={11} />
            <YAxis fontSize={11} width={44} />
            <Tooltip formatter={(v) => um(Number(v))} labelFormatter={(r) => rpm(Number(r))} />
            <Legend />
            <ReferenceLine x={currentRpm} stroke="#64748b" strokeDasharray="4 2" label="now" />
            <Line name="1x" dataKey="a1" dot={false} stroke="#6366f1" isAnimationActive={false} />
            <Line name="2x" dataKey="a2" dot={false} stroke="#f59e0b" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-slate-600 dark:text-slate-400">
        Noise-free simulated 1x and 2x amplitude versus speed at this load. 1x peaks at{" "}
        {um(peak.a1)} near {rpm(peak.rpm)}.
      </figcaption>
    </figure>
  );
}

function Waveform({ result }: { result: LabResult }) {
  const data = result.time_s.map((t, i) => ({ t: t * 1000, x: result.displacement_um[i] }));
  return (
    <figure className="space-y-1">
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="t" type="number" domain={[0, 200]} fontSize={11} unit=" ms" />
            <YAxis fontSize={11} width={44} />
            <Line dataKey="x" dot={false} stroke="#0f766e" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-slate-600 dark:text-slate-400">
        First 0.2 s of the simulated displacement signal (µm), with sensor noise.
      </figcaption>
    </figure>
  );
}

/** Manual lab on the public preset machine: never a sealed case, so nothing is revealed. */
export default function ManualLab() {
  const [params, setParams] = useState<LabRequest>(INITIAL);
  const [reading, setReading] = useState<{ request: LabRequest; result: LabResult } | null>(
    null,
  );
  const result = reading?.result ?? null;
  const readingRpm = reading?.request.rpm ?? params.rpm;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      simulateLab(params)
        .then((r) => {
          if (!active) return;
          setReading({ request: params, result: r });
          setError(null);
        })
        .catch((e: unknown) => {
          if (active) setError(e instanceof Error ? e.message : String(e));
        });
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [params]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Manual lab</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Set faults and operating point on a public preset machine (critical speed 3,600 RPM,
            thermal factor 1.0). It is not one of the sealed cases.
          </p>
        </div>
        <SimulatedLabel />
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel title="Controls">
          <div className="space-y-3">
            {SLIDERS.map((s) => (
              <label key={s.key} className="block text-sm">
                <span className="flex justify-between">
                  {s.label}
                  <span className="font-mono tabular-nums">{s.format(params[s.key])}</span>
                </span>
                <input
                  type="range"
                  className="w-full accent-indigo-600"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={params[s.key]}
                  onChange={(e) => setParams((p) => ({ ...p, [s.key]: Number(e.target.value) }))}
                />
              </label>
            ))}
            <label className="flex items-center justify-between text-sm">
              Noise seed
              <input
                type="number"
                min={0}
                className="w-24 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                value={params.seed}
                onChange={(e) =>
                  setParams((p) => ({ ...p, seed: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </label>
          </div>
        </Panel>

        <Panel title="Readings">
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          {result ? (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Lab readings">
              <Reading label="1x" value={um(result.amp_1x_um)} />
              <Reading label="2x" value={um(result.amp_2x_um)} />
              <Reading label="Broadband" value={um(result.broadband_um)} />
              <Reading label="Temp. rise" value={celsius(result.temp_rise_c)} />
            </dl>
          ) : (
            !error && <p role="status">Simulating…</p>
          )}
        </Panel>
      </div>

      {result && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Response curve">
            <ResponseCurve result={result} currentRpm={readingRpm} />
          </Panel>
          <Panel title="Spectrum">
            <SpectrumChart
              freq={result.spectrum_freq_hz}
              amp={result.spectrum_amp_um}
              rpm={readingRpm}
            />
          </Panel>
          <Panel title="Waveform">
            <Waveform result={result} />
          </Panel>
          {reading && (
            <Panel title="Digital twin">
              <TwinPanel
                reading={{
                  rpm: reading.request.rpm,
                  load_n: reading.request.load_n,
                  measured: reading.result,
                }}
                seed={reading.request.seed}
              />
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
