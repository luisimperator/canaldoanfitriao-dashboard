"use client";

import { useCallback, useEffect, useState } from "react";

// Quem é chamado no WhatsApp quando a IA escala um caso.
//
// Sem isso o caso ficava esperando alguém lembrar de abrir o painel. Cada
// pessoa tem liga/desliga próprio (dá pra tirar da escala sem apagar o
// cadastro) e pode filtrar por motivo — o Ivanildo recebe tudo, alguém do
// comercial só os leads, por exemplo.

export const MOTIVOS: { key: string; label: string }[] = [
  { key: "cancelamento_renovacao", label: "Cancelar renovação" },
  { key: "reembolso", label: "Reembolso" },
  { key: "divergencia_pagamento", label: "Divergência de pagamento" },
  { key: "brinde_nao_recebido", label: "Brinde não recebido" },
  { key: "resgate_bf", label: "Resgate Black Friday" },
  { key: "duvida_acesso", label: "Dúvida de acesso" },
  { key: "lead_comercial", label: "Lead → comercial" },
  { key: "outro", label: "Outro" },
];

interface Pessoa {
  id: string;
  nome: string;
  telefone: string;
  ativo: boolean;
  motivos: string[] | null;
  observacao: string | null;
}

function telefoneBonito(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d}`;
}

export function Notificacoes() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/support/notificacoes");
    if (!res.ok) return;
    const j = await res.json();
    setPessoas(j.pessoas ?? []);
  }, []);

  // Carga inicial fora do corpo do efeito (setTimeout 0): a regra do React
  // nesta versão proíbe setState síncrono dentro do efeito.
  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  async function adicionar() {
    if (!nome.trim() || !telefone.trim()) return;
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const res = await fetch("/api/support/notificacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, telefone }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(j.error ?? `Erro ${res.status}`);
        return;
      }
      setNome("");
      setTelefone("");
      await carregar();
    } finally {
      setBusy(false);
    }
  }

  async function alternar(p: Pessoa) {
    await fetch("/api/support/notificacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, ativo: !p.ativo }),
    });
    carregar();
  }

  async function trocarMotivo(p: Pessoa, motivo: string) {
    const atuais = p.motivos ?? [];
    const novos = atuais.includes(motivo)
      ? atuais.filter((m) => m !== motivo)
      : [...atuais, motivo];
    await fetch("/api/support/notificacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, motivos: novos }),
    });
    carregar();
  }

  async function remover(p: Pessoa) {
    await fetch(`/api/support/notificacoes?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    carregar();
  }

  async function testar(p: Pessoa) {
    setMsg(null);
    setErro(null);
    const res = await fetch("/api/support/notificacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teste: true, telefone: p.telefone }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) setMsg(`Aviso de teste enviado para ${p.nome}.`);
    else setErro(j.error ?? `Erro ${res.status}`);
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome (ex.: Ivanildo)"
          className="w-full rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm sm:w-48"
        />
        <input
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="WhatsApp com DDD"
          inputMode="tel"
          className="w-full rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm sm:w-48"
        />
        <button
          onClick={adicionar}
          disabled={busy || !nome.trim() || !telefone.trim()}
          className="rounded-lg bg-slate-900 dark:bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? "Salvando..." : "Adicionar"}
        </button>
      </div>

      {erro && <p className="mb-2 text-xs text-rose-600 dark:text-rose-400">{erro}</p>}
      {msg && <p className="mb-2 text-xs text-emerald-600 dark:text-emerald-400">{msg}</p>}

      {pessoas.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-zinc-500">
          Ninguém cadastrado ainda. Enquanto essa lista estiver vazia, os casos escalados só
          aparecem no painel e ninguém é chamado.
        </p>
      ) : (
        <div className="space-y-2">
          {pessoas.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-slate-200 dark:border-white/10 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                    {p.nome}
                  </span>
                  <span className="ml-2 text-xs text-slate-400 dark:text-zinc-500">
                    {telefoneBonito(p.telefone)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => alternar(p)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      p.ativo
                        ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-zinc-400"
                    }`}
                  >
                    {p.ativo ? "Recebendo" : "Pausado"}
                  </button>
                  <button
                    onClick={() => testar(p)}
                    className="rounded-lg border border-slate-300 dark:border-white/15 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    Testar
                  </button>
                  <button
                    onClick={() => remover(p)}
                    className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-[11px] text-slate-400 dark:text-zinc-500 mr-1 self-center">
                  {p.motivos && p.motivos.length > 0 ? "só estes motivos:" : "todos os motivos"}
                </span>
                {MOTIVOS.map((m) => {
                  const on = p.motivos?.includes(m.key) ?? false;
                  return (
                    <button
                      key={m.key}
                      onClick={() => trocarMotivo(p, m.key)}
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        on
                          ? "bg-violet-600 text-white font-semibold"
                          : "bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/15"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
