"use client";

import Link from "next/link";
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

interface Mensagem {
  id: string;
  direction: "in" | "out";
  text: string | null;
  tipo: string;
  autor: string | null;
  created_at: string;
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function HandoffsList({ initial }: { initial: HandoffRow[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  // Conversa aberta dentro do card (id do handoff) e o que já foi carregado.
  const [aberta, setAberta] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, Mensagem[] | "vazio">>({});

  async function setStatus(row: HandoffRow, next: string) {
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

  async function advance(row: HandoffRow) {
    const next = NEXT_STATUS[row.status];
    if (next) await setStatus(row, next);
  }

  // Lê a conversa do WhatsApp sem sair da fila — antes de assumir, dá pra ver
  // o que o cliente escreveu de verdade, não só o resumo da IA.
  async function verConversa(row: HandoffRow) {
    if (aberta === row.id) {
      setAberta(null);
      return;
    }
    setAberta(row.id);
    if (threads[row.id] || !row.telefone) return;
    const res = await fetch(`/api/support/inbox?phone=${encodeURIComponent(row.telefone)}`);
    if (!res.ok) {
      setThreads((t) => ({ ...t, [row.id]: "vazio" }));
      return;
    }
    const j = await res.json();
    const msgs = (j.mensagens ?? []) as Mensagem[];
    setThreads((t) => ({ ...t, [row.id]: msgs.length > 0 ? msgs : "vazio" }));
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
          className="rounded-lg border border-slate-200 dark:border-white/10 p-3"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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
          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
            {r.telefone && (
              <button
                onClick={() => verConversa(r)}
                className="rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                {aberta === r.id ? "Fechar conversa" : "Ver conversa"}
              </button>
            )}
            {r.status === "em_andamento" && (
              <button
                onClick={() => setStatus(r, "aberto")}
                disabled={busy === r.id}
                className="rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
              >
                Devolver pra fila
              </button>
            )}
            {NEXT_STATUS[r.status] && (
              <button
                onClick={() => advance(r)}
                disabled={busy === r.id}
                className="rounded-lg bg-slate-900 dark:bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 dark:hover:bg-violet-500 disabled:opacity-50"
              >
                {busy === r.id
                  ? "…"
                  : r.status === "aberto"
                    ? "Assumir"
                    : "Marcar resolvido"}
              </button>
            )}
          </div>
          </div>

          {aberta === r.id && (
            <div className="mt-3 border-t border-slate-200 dark:border-white/10 pt-3">
              {!threads[r.id] ? (
                <p className="text-xs text-slate-400 dark:text-zinc-500">Carregando conversa…</p>
              ) : threads[r.id] === "vazio" ? (
                <p className="text-xs text-slate-400 dark:text-zinc-500">
                  Sem conversa no WhatsApp oficial para {r.telefone}. Casos antigos (ou abertos
                  pelo simulador) não têm histórico aqui.
                </p>
              ) : (
                <>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {(threads[r.id] as Mensagem[]).map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${
                            m.direction === "in"
                              ? "bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-zinc-200"
                              : "bg-violet-600/90 text-white"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">
                            {m.text || `(${m.tipo})`}
                          </p>
                          <span
                            className={`mt-0.5 block text-[10px] ${
                              m.direction === "in"
                                ? "text-slate-400 dark:text-zinc-500"
                                : "text-white/70"
                            }`}
                          >
                            {m.direction === "out" ? `${m.autor === "ia" ? "IA" : "humano"} · ` : ""}
                            {hora(m.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link
                    href={`/suporte/inbox?fone=${encodeURIComponent(r.telefone ?? "")}`}
                    className="mt-2 inline-block text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    Abrir na caixa de entrada para responder →
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
