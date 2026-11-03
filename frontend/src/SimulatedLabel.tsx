/** Visible honesty label: every simulator view shows that its data is simulated. */
export default function SimulatedLabel() {
  return (
    <span
      className="rounded-sm border border-amber-600 bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-400 dark:bg-amber-900 dark:text-amber-100"
      title="Data in this view comes from the physics simulator, not a real machine."
    >
      Simulated
    </span>
  );
}
