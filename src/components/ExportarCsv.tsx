"use client";

import { useState } from "react";

// Baixa os lançamentos do período em CSV. Confirma o período antes: o seletor
// pode ter acabado de mudar, e CSV de mês errado costuma viajar direto pro
// contador.

export function ExportarCsv({ href, periodo }: { href: string; periodo?: string }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        title="Exportar o período em CSV"
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] px-3 py-1.5 text-sm text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
      >
        <svg
          className="h-4 w-4 text-slate-400 dark:text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
          />
        </svg>
        <span className="hidden sm:inline">Exportar</span>
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Exportar CSV"
        >
          <div
            className="absolute inset-0 bg-slate-900/60 dark:bg-black/70"
            onClick={() => setAberto(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-sm space-y-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Exportar CSV</h3>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              {periodo
                ? `Baixar as transações de ${periodo}?`
                : "Baixar as transações do período selecionado?"}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setAberto(false)}
                className="rounded-lg px-3 py-2 text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
              >
                Cancelar
              </button>
              <button
                autoFocus
                onClick={() => {
                  setAberto(false);
                  window.location.href = href;
                }}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
              >
                Baixar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
