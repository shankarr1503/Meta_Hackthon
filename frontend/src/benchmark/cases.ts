const SEALED_CASES = 6;
const HYPOTHESES = 6;

/** Which runs a planner row covers, from its recorded protocol. */
export function casesLabel(protocol: Record<string, unknown> | undefined): string {
  const seeds = Number(protocol?.sealed_seeds ?? 0);
  const generated = Number(protocol?.generated_per_hypothesis ?? 0) * HYPOTHESES;
  const sealed = `${SEALED_CASES} sealed × ${seeds} seeds`;
  return generated > 0 ? `${sealed} + ${generated} generated` : sealed;
}
