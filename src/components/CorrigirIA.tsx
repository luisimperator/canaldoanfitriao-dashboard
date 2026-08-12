"use client";

import { useState } from "react";
import { KB_BLOCOS } from "@/lib/support";

// Modo chefe: corrige a IA em cima de um atendimento REAL e transforma a
// bronca numa regra permanente do treinamento.
//
// O ciclo que isso fecha: a IA erra → você escreve o que ela deveria ter dito
// → a IA transforma sua bronca numa regra → a regra entra na base e vale pra
// todos os atendimentos seguintes. Sem isso, o mesmo erro se repete pra sempre
// porque a correção morre na conversa.

interface Sugestao {
  bloco: string;
  titulo: string;
  conteudo: string;
}

export function CorrigirIA({
  mensagemCliente,
  respostaIA,
  onFechar,
}: {
  mensagemCliente: string;
  respostaIA: string;
  onFechar: () => void;
}) {
  const [bronca, setBronca] = useState("");
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  async function gerar() {
    if (!bronca.trim()) return;
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/support/suggest-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: bronca,
          customerMessage: mensagemCliente,
          aiReply: respostaIA,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(j.error ?? `Erro ${res.status}`);
        return;
      }
      setSugestao({ bloco: j.bloco, titulo: j.titulo, conteudo: j.conteudo });
    } catch {
      setErro("Falha de rede");
    } finally {
      setBusy(false);
    }
  }

  async function salvar() {
    if (!sugestao) return;
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/support/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sugestao, ativo: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(j.error ?? `Erro ${res.status}`);
        return;
      }
      setSalvo(true);
    } catch {
      setErro("Falha de rede");
    } finally {
      setBusy(false);
    }
  }

  const campo =
    "w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-2.5 py-1.5 text-sm text-slate-900 dark:text-zinc-100";

  if (salvo) {
    return (
      <div className="mt-2 rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm">
        <p className="font-semibold text-emerald-800 dark:text-emerald-200">
          ✓ Regra salva no treinamento
        </p>
        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
          Vale a partir do próximo atendimento — inclusive nesta conversa. Dá pra editar
          depois em Suporte → Treinamento da IA.
        </p>
        <button
          onClick={onFechar}
          className="mt-2 rounded-lg border border-emerald-300 dark:border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-200"
        >
          Fechar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.07] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          Modo chefe — corrigir a IA
        </p>
        <button
          onClick={onFechar}
          className="text-xs text-amber-700 dark:text-amber-400 hover:underline"
        >
          cancelar
        </button>
      </div>

      {!sugestao ? (
        <>
          <p className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-200/70">
            Escreva do seu jeito o que ela deveria ter feito. Eu transformo em regra.
          </p>
          <textarea
            value={bronca}
            onChange={(e) => setBronca(e.target.value)}
            rows={3}
            placeholder="Ex.: nunca prometa prazo de reembolso, só diga que vai encaminhar pro financeiro"
            className={`${campo} mt-2`}
          />
          <button
            onClick={gerar}
            disabled={busy || !bronca.trim()}
            className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {busy ? "Pensando..." : "Gerar regra"}
          </button>
        </>
      ) : (
        <div className="mt-2 space-y-2">
          <div>
            <label className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
              Bloco
            </label>
            <select
              value={sugestao.bloco}
              onChange={(e) => setSugestao({ ...sugestao, bloco: e.target.value })}
              className={campo}
            >
              {KB_BLOCOS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
              Título
            </label>
            <input
              value={sugestao.titulo}
              onChange={(e) => setSugestao({ ...sugestao, titulo: e.target.value })}
              className={campo}
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
              Regra (é isso que a IA vai seguir)
            </label>
            <textarea
              value={sugestao.conteudo}
              onChange={(e) => setSugestao({ ...sugestao, conteudo: e.target.value })}
              rows={4}
              className={campo}
            />
          </div>
          <p className="text-[11px] text-amber-800/80 dark:text-amber-200/70">
            Confira antes de salvar. Se aparecer <code>[PREENCHER]</code>, é porque faltou um
            dado (prazo, link, valor) — complete você, a IA não inventa.
          </p>
          <div className="flex gap-2">
            <button
              onClick={salvar}
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? "Salvando..." : "Salvar no treinamento"}
            </button>
            <button
              onClick={() => setSugestao(null)}
              className="rounded-lg border border-amber-300 dark:border-amber-500/30 px-3 py-1.5 text-sm font-semibold text-amber-800 dark:text-amber-200"
            >
              Reescrever
            </button>
          </div>
        </div>
      )}
      {erro && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{erro}</p>}
    </div>
  );
}
