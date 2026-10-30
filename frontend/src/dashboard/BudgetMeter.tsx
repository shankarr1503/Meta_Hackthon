export default function BudgetMeter({ remaining, budget }: { remaining: number; budget: number }) {
  const spent = budget - remaining;
  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span>Experiment budget</span>
        <span className="font-mono tabular-nums">
          {spent} of {budget} points spent
        </span>
      </div>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: budget }, (_, i) => (
          <span
            key={i}
            className={`h-2 flex-1 rounded ${
              i < spent ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-800"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
