import type { ReactNode } from "react";

export default function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 border-b border-slate-100 pb-2 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:border-slate-800">
        {title}
      </h3>
      {children}
    </section>
  );
}
