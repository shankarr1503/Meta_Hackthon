/** Display helpers. Probabilities are always shown as numbers. */
export const HYPOTHESES = [
  "healthy",
  "imbalance",
  "misalignment",
  "friction",
  "imbalance+friction",
  "imbalance+misalignment",
] as const;

const NAMES: Record<string, string> = {
  healthy: "Healthy",
  imbalance: "Imbalance",
  misalignment: "Misalignment",
  friction: "Bearing friction",
  "imbalance+friction": "Imbalance + friction",
  "imbalance+misalignment": "Imbalance + misalignment",
};

export const PLANNER_NAMES: Record<string, string> = {
  meta: "Meta model",
  info_gain: "Information gain",
  sweep: "Fixed sweep",
  random: "Random",
  info_gain_fallback: "Information gain (Meta fallback)",
  info_gain_meta_cases: "Information gain (same runs as Meta)",
};

export function hypothesisName(hypothesis: string): string {
  return NAMES[hypothesis] ?? hypothesis;
}

/** The given hypothesis keys in the standard display order; unknown keys go last. */
export function orderedHypotheses(keys: string[]): string[] {
  const known: readonly string[] = HYPOTHESES;
  return [
    ...known.filter((h) => keys.includes(h)),
    ...keys.filter((h) => !known.includes(h)),
  ];
}

export function plannerName(planner: string): string {
  return PLANNER_NAMES[planner] ?? planner;
}

export function percent(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`;
}

/** A Bayesian probability for display. Never shows a rounded-up certainty: values that
 * round to 100.0% or to 0.0% but are not exactly 0 read ">99.9%" or "<0.1%". */
export function probability(p: number): string {
  if (p >= 0.9995) return ">99.9%";
  if (p > 0 && p < 0.0005) return "<0.1%";
  return percent(p);
}

export function um(value: number): string {
  return `${value.toFixed(value < 10 ? 2 : 1)} µm`;
}

export function celsius(value: number): string {
  return `${value.toFixed(1)} °C`;
}

export function rpm(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} RPM`;
}

export function newtons(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} N`;
}

export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
