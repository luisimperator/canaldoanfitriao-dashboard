import type { ReactNode } from "react";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{subtitle}</p>}
    </header>
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-white dark:bg-[#15121f] rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-5 ${className}`}
    >
      {title && (
        <h2 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-4">{title}</h2>
      )}
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-slate-900 dark:text-zinc-100";
  return (
    <div className="bg-white dark:bg-[#15121f] rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-4">
      <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
        {label}
      </div>
      <div className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="text-xs text-slate-400 dark:text-zinc-500 mt-1">{hint}</div>}
    </div>
  );
}

export function DemoBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mb-6 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      <strong>Modo demonstração:</strong> exibindo dados de exemplo. Configure o
      Supabase e as integrações na aba{" "}
      <a href="/integracoes" className="underline font-medium">
        Integrações
      </a>{" "}
      para ver os números reais.
    </div>
  );
}
