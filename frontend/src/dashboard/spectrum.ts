import { um } from "../format";

/** Text summary of a spectrum: the amplitude nearest the 1x and 2x running-speed lines. */
export function spectrumSummary(freq: number[], amp: number[], rpmValue: number): string {
  const nearest = (target: number) => {
    let best = 0;
    freq.forEach((f, i) => {
      if (Math.abs(f - target) < Math.abs(freq[best] - target)) best = i;
    });
    return amp[best] ?? 0;
  };
  const f1 = rpmValue / 60;
  if (f1 <= 0 || freq.length === 0) return "Shaft stopped: no running-speed lines.";
  return (
    `1x at ${f1.toFixed(1)} Hz: ${um(nearest(f1))}; ` +
    `2x at ${(2 * f1).toFixed(1)} Hz: ${um(nearest(2 * f1))}.`
  );
}
