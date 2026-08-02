"use client";

import { useCallback, useEffect, useState } from "react";

// Templates da Meta: os únicos textos que o WhatsApp entrega fora da janela de
// 24h. Aqui dá pra criar, acompanhar a aprovação e apagar sem abrir o painel
// da Meta.

interface Template {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  rejectedReason?: string | null;
  body: string;
  params: number;
}

const STATUS_BADGE: Record<string, string> = {
  APPROVED: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  PENDING: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  REJECTED: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300",
  PAUSED: "bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-400",
  DISABLED: "bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-400",
};

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Em análise",
  REJECTED: "Recusado",
  PAUSED: "Pausado",
  DISABLED: "Desativado",
};

// Sugestão pronta do aviso interno: é o template que a tela de avisos usa por
// padrão (whatsapp_flags_extra.alerta_template = caso_suporte_novo).
const SUGESTAO = {
  name: "caso_suporte_novo",
  body:
    "Caso novo no suporte: {{1}}.\n" +
    "Cliente: {{2}}\n" +
    "Resumo: {{3}}\n\n" +
    "Abra o painel para assumir.",
  exemplos: [
    "reembolso",
    "Mauricio Segobia",
    "Cliente quer cancelar a renovação do Gigantes e pediu o estorno.",
  ],
};

export function Templates() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(SUGESTAO.name);
  const [corpo, setCorpo] = useState(SUGESTAO.body);
  const [categoria, setCategoria] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [exemplos, setExemplos] = useState(SUGESTAO.exemplos.join(" | "));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/support/templates");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErroLista(j.error ?? `Erro ${res.status}`);
      setTemplates([]);
      return;
    }
    setErroLista(null);
    setTemplates(j.templates ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  const qtdParams = [...corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const nParams = qtdParams.length > 0 ? Math.max(...qtdParams) : 0;

  async function criar() {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const res = await fetch("/api/support/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nome,
          body: corpo,
          category: categoria,
          language: "pt_BR",
          exemplos: exemplos.split("|").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(j.error ?? `Erro ${res.status}`);
        return;
      }
      setMsg("Enviado pra Meta. Costuma sair da análise em minutos.");
      setAberto(false);
      await carregar();
    } finally {
      setBusy(false);
    }
  }

  async function apagar(t: Template) {
    await fetch(`/api/support/templates?name=${encodeURIComponent(t.name)}`, { method: "DELETE" });
    carregar();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setAberto(!aberto)}
          className="rounded-lg bg-slate-900 dark:bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 dark:hover:bg-violet-500"
        >
          {aberto ? "Cancelar" : "Novo template"}
        </button>
        <button
          onClick={carregar}
          className="rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
        >
          Atualizar
        </button>
        {msg && <span className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</span>}
      </div>

      {aberto && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-white/10 p-3 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value.toLowerCase())}
              placeholder="nome_do_template"
              className="w-full rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm sm:w-64"
            />
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value === "MARKETING" ? "MARKETING" : "UTILITY")}
              className="rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm"
            >
              <option value="UTILITY">Utilidade (aviso, atendimento)</option>
              <option value="MARKETING">Marketing (promoção)</option>
            </select>
          </div>
          <textarea
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm font-mono"
          />
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            Use <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>… para as partes que mudam a cada
            envio. Este texto tem <strong>{nParams}</strong> {nParams === 1 ? "variável" : "variáveis"}.
          </p>
          {nParams > 0 && (
            <input
              value={exemplos}
              onChange={(e) => setExemplos(e.target.value)}
              placeholder="exemplo de cada variável, separados por |"
              className="w-full rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm"
            />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={criar}
              disabled={busy || !nome.trim() || !corpo.trim()}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? "Enviando..." : "Enviar pra aprovação"}
            </button>
            {erro && <span className="text-xs text-rose-600 dark:text-rose-400">{erro}</span>}
          </div>
        </div>
      )}

      {erroLista && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          Não consegui ler os templates na Meta: {erroLista}
        </p>
      )}

      {templates === null ? (
        <p className="text-sm text-slate-400 dark:text-zinc-500">Carregando…</p>
      ) : templates.length === 0 && !erroLista ? (
        <p className="text-sm text-slate-400 dark:text-zinc-500">
          Nenhum template ainda. Crie o <code>caso_suporte_novo</code> (já vem preenchido no
          formulário) para o aviso interno funcionar.
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-200 dark:border-white/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-800 dark:text-zinc-200">
                  {t.name}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    STATUS_BADGE[t.status] ?? "bg-slate-100 dark:bg-white/[0.07] text-slate-600"
                  }`}
                >
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                  {t.category} · {t.language}
                  {t.params > 0 ? ` · ${t.params} variáveis` : ""}
                </span>
                <button
                  onClick={() => apagar(t)}
                  className="ml-auto text-xs text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Apagar
                </button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 dark:text-zinc-400">
                {t.body}
              </p>
              {t.status === "REJECTED" && t.rejectedReason && (
                <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                  Motivo da recusa: {t.rejectedReason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
