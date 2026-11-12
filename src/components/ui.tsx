import type { ReactNode } from "react";

// Peças básicas do painel. Cores pelas variáveis de globals.css (surface,
// line, ink, ink-2), que mudam sozinhas entre dia e noite.

export function PageHeader({ title, subtitle, eyebrow }: { title: string; subtitle?: string; eyebrow?: string }) {
  return (
    <header className="mb-7">
      {eyebrow && (
        <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink-2">{eyebrow}</div>
      )}
      <h1 className="text-[28px] sm:text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">{title}</h1>
      {subtitle && <p className="mt-2 max-w-3xl text-sm text-ink-2">{subtitle}</p>}
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
      className={`rounded-[22px] border border-line bg-surface p-5 sm:p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.08)] dark:shadow-none ${className}`}
    >
      {title && <h2 className="mb-4 text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>}
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
          : "text-ink";
  return (
    <div className="rounded-[20px] border border-line bg-surface p-4 sm:p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:shadow-none">
      <div className="text-[12px] font-medium text-ink-2">{label}</div>
      <div className={`mt-1.5 text-2xl sm:text-[28px] font-semibold tabular-nums tracking-[-0.02em] leading-none ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-ink-2">{hint}</div>}
    </div>
  );
}

export function DemoBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mb-6 rounded-2xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      <strong>Modo demonstração:</strong> exibindo dados de exemplo. Configure o
      Supabase e as integrações na aba{" "}
      <a href="/integracoes" className="underline font-medium">
        Integrações
      </a>{" "}
      para ver os números reais.
    </div>
  );
}
