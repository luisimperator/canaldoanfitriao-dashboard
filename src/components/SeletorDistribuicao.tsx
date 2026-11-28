"use client";

// Seletor "este mês | mês que vem" da distribuição na Provisão. A prévia do
// mês que vem leva uns segundos pra calcular (varre o caixa de novo), então o
// botão mostra que está calculando — sem isso o toque parecia não fazer nada
// (Fernando, 28/11: "Clico em janeiro e não vai").

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SeletorDistribuicao({
  opcoes,
}: {
  opcoes: { label: string; href: string; ativo: boolean }[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500 dark:text-zinc-400">Distribuição</span>
      <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-surface p-0.5">
        {opcoes.map((o) => (
          <button
            key={o.href}
            type="button"
            disabled={pendente || o.ativo}
            onClick={() => startTransition(() => router.push(o.href, { scroll: false }))}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors disabled:cursor-default ${
              o.ativo
                ? "bg-slate-900 dark:bg-zinc-100 dark:text-zinc-900 text-white"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-800"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {pendente && (
        <span className="animate-pulse text-xs text-slate-500 dark:text-zinc-400">calculando…</span>
      )}
    </div>
  );
}
