"use client";

import { useState } from "react";

export interface HandoffRow {
  id: string;
  created_at: string;
  email: string | null;
  nome: string | null;
  telefone: string | null;
  motivo: string;
  resumo: string | null;
  status: string;
  responsavel: string | null;
}

const MOTIVO_LABEL: Record<string, string> = {
  cancelamento_renovacao: "Cancelar renovação",
  reembolso: "Reembolso",
  divergencia_pagamento: "Divergência de pagamento",
  brinde_nao_recebido: "Brinde não recebido",
  resgate_bf: "Resgate Black Friday",
  duvida_acesso: "Dúvida de acesso",
  lead_comercial: "Lead → comercial",
  outro: "Outro",
};

const STATUS_BADGE: Record<string, string> = {
  aberto: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300",
  em_andamento: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  resolvido: "bg-emerald-100 text-emerald-700 dark:text-emerald-300",
};

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
};

const NEXT_STATUS: Record<string, string | null> = {
  aberto: "em_andamento",
  em_andamento: "resolvido",
  resolvido: null,
};

export function HandoffsList({ initial }: { initial: HandoffRow[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function advance(row: HandoffRow) {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
    setBusy(row.id);
    try {
      const res = await fetch("/api/support/handoff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status: next }),
      });
      if (res.ok) {
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
      }
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-zinc-500">
        Nenhum caso na fila. Quando a IA não conseguir resolver sozinha (ex.:
        cancelamento, reembolso, brinde), ela abre um card aqui com o resumo do
        atendimento para um humano assumir.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div
          key={r.id}
          className="rounded-lg border border-slate-200 dark:border-white/10 p-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                {r.nome || r.email || r.telefone || "Contato"}
              </span>
              <span className="rounded-full bg-slate-100 dark:bg-white/[0.07] px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                {MOTIVO_LABEL[r.motivo] ?? r.motivo}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  STATUS_BADGE[r.status] ?? "bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-400"
                }`}
              >
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </div>
            {r.resumo && <p className="mt-1 text-xs text-slate-600 dark:text-zinc-400 whitespace-pre-wrap">{r.resumo}</p>}
            <div className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500">
              {r.email ?? "—"} · {r.telefone ?? "—"} ·{" "}
              {new Date(r.created_at).toLocaleString("pt-BR")}
            </div>
          </div>
          {NEXT_STATUS[r.status] && (
            <button
              onClick={() => advance(r)}
              disabled={busy === r.id}
              className="shrink-0 self-start rounded-lg bg-slate-900 dark:bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 dark:hover:bg-violet-500 disabled:opacity-50"
            >
              {busy === r.id
                ? "…"
                : r.status === "aberto"
                  ? "Assumir"
                  : "Marcar resolvido"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
