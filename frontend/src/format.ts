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
};

export function hypothesisName(hypothesis: string): string {
  return NAMES[hypothesis] ?? hypothesis;
}

export function plannerName(planner: string): string {
  return PLANNER_NAMES[planner] ?? planner;
}

export function percent(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`;
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
