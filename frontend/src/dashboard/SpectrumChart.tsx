import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { um } from "../format";
import { spectrumSummary } from "./spectrum";

export default function SpectrumChart({
  freq,
  amp,
  rpm,
}: {
  freq: number[];
  amp: number[];
  rpm: number;
}) {
  const data = freq.map((f, i) => ({ f, a: amp[i] }));
  const f1 = rpm / 60;
  return (
    <figure className="space-y-1">
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis
              dataKey="f"
              type="number"
              domain={[0, 200]}
              tickCount={9}
              fontSize={11}
              label={{ value: "Hz", position: "insideBottomRight", offset: -8, fontSize: 11 }}
            />
            <YAxis fontSize={11} width={40} />
            <Tooltip
              formatter={(value) => [um(Number(value)), "Amplitude"]}
              labelFormatter={(f) => `${Number(f).toFixed(0)} Hz`}
            />
            {f1 > 0 && <ReferenceLine x={f1} stroke="#6366f1" strokeDasharray="4 2" label="1x" />}
            {f1 > 0 && 2 * f1 <= 200 && (
              <ReferenceLine x={2 * f1} stroke="#f59e0b" strokeDasharray="4 2" label="2x" />
            )}
            <Line dataKey="a" dot={false} stroke="#0f766e" strokeWidth={1.5} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-slate-600 dark:text-slate-400">
        Simulated amplitude spectrum (µm). {spectrumSummary(freq, amp, rpm)}
      </figcaption>
    </figure>
  );
}
