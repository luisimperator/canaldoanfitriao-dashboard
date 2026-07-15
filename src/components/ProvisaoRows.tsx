"use client";

import { useState } from "react";
import type { ProvisaoDia } from "@/lib/provisao-caixa";
import { METODO_LABEL } from "@/lib/provisao-caixa";
import { brl } from "@/lib/format";
import { dayLabel } from "@/components/ProvisaoTimeline";

// Lista de liberações agrupadas por dia — cada linha é um accordion que abre
// as cobranças (comprador · produto · método · líquido). Tom emerald = pago
// (creditDate exato); tom amber = a vencer (previsão, prefixo ~).

function Linha({ dia, hoje, tone }: { dia: ProvisaoDia; hoje: string; tone: "emerald" | "amber" }) {
  const [open, setOpen] = useState(false);
  const valorCls =
    tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03]"
      >
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
            {tone === "amber" && "~ "}
            {dayLabel(dia.dia, hoje)}
          </div>
          <div className="text-xs text-slate-400 dark:text-zinc-500">
            {dia.cobrancas} cobrança{dia.cobrancas === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold tabular-nums ${valorCls}`}>{brl(dia.valor)}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-slate-400 dark:text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>
      {open && (
        <ul className="border-t border-slate-100 dark:border-white/[0.06] px-4 py-2">
          {dia.items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <div className="min-w-0">
                <div className="truncate text-slate-700 dark:text-zinc-300">{it.nome}</div>
                <div className="truncate text-xs text-slate-400 dark:text-zinc-500">
                  {it.produto} · {METODO_LABEL[it.metodo] ?? it.metodo}
                </div>
              </div>
              <span className="shrink-0 tabular-nums font-semibold text-slate-900 dark:text-zinc-100">
                {brl(it.valor)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProvisaoRows({
  dias,
  hoje,
  tone,
}: {
  dias: ProvisaoDia[];
  hoje: string;
  tone: "emerald" | "amber";
}) {
  return (
    <div className="space-y-2">
      {dias.map((d) => (
        <Linha key={d.dia} dia={d} hoje={hoje} tone={tone} />
      ))}
    </div>
  );
}
