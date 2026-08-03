"use client";

import { useState } from "react";
import { KB_BLOCOS, blocoLabel, type KbItem } from "@/lib/support";

const EMPTY = { id: "", bloco: "ingressos", titulo: "", conteudo: "", ativo: true, ordem: 0, valido_ate: "" };

const HOJE = new Date().toISOString().slice(0, 10);
function expirado(it: KbItem) {
  return Boolean(it.valido_ate && it.valido_ate < HOJE);
}

export function TreinamentoEditor({ initial }: { initial: KbItem[] }) {
  const [items, setItems] = useState<KbItem[]>(initial);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Caixinha mágica: escreve a regra de qualquer jeito, a IA organiza e salva.
  const [prompt, setPrompt] = useState("");
  const [organizando, setOrganizando] = useState(false);
  const [promptErro, setPromptErro] = useState<string | null>(null);
  const [promptOk, setPromptOk] = useState<KbItem | null>(null);

  async function organizar() {
    if (prompt.trim().length < 10) {
      setPromptErro("Escreva a regra com um pouco mais de contexto.");
      return;
    }
    setOrganizando(true);
    setPromptErro(null);
    setPromptOk(null);
    try {
      const res = await fetch("/api/support/kb/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: prompt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPromptErro(json.error ?? "Erro ao organizar a regra.");
        return;
      }
      const saved = json.item as KbItem;
      setItems((list) =>
        [...list, saved].sort((a, b) => a.bloco.localeCompare(b.bloco) || a.ordem - b.ordem)
      );
      setPromptOk(saved);
      setPrompt("");
    } catch {
      setPromptErro("Falha de rede.");
    } finally {
      setOrganizando(false);
    }
  }

  async function copy(it: KbItem) {
    const text = it.titulo ? `${it.titulo}\n\n${it.conteudo}` : it.conteudo;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(it.id);
      setTimeout(() => setCopiedId((c) => (c === it.id ? null : c)), 1500);
    } catch {
      setError("Não consegui copiar (o navegador bloqueou).");
    }
  }

  function edit(it: KbItem) {
    setForm({
      id: it.id,
      bloco: it.bloco,
      titulo: it.titulo,
      conteudo: it.conteudo,
      ativo: it.ativo,
      ordem: it.ordem,
      valido_ate: it.valido_ate ?? "",
    });
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setForm(EMPTY);
    setError(null);
  }

  async function save() {
    if (!form.titulo.trim()) {
      setError("Dê um título ao item.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/support/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao salvar.");
        return;
      }
      const saved = json.item as KbItem;
      setItems((list) => {
        const without = list.filter((i) => i.id !== saved.id);
        return [...without, saved].sort(
          (a, b) => a.bloco.localeCompare(b.bloco) || a.ordem - b.ordem
        );
      });
      reset();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este item do treinamento?")) return;
    const res = await fetch(`/api/support/kb?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setItems((list) => list.filter((i) => i.id !== id));
  }

  const byBloco = KB_BLOCOS.map((b) => ({
    ...b,
    items: items.filter((i) => i.bloco === b.key),
  })).filter((b) => b.items.length > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Editor */}
      <div className="h-fit space-y-4 lg:sticky lg:top-6">
        {/* Caixinha mágica: prompt livre → a IA escreve, classifica e salva */}
        <div className="rounded-xl border-2 border-violet-300 dark:border-violet-500/40 bg-violet-50/60 dark:bg-violet-500/[0.07] p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-slate-800 dark:text-zinc-200">
            ✨ Escreva a regra do seu jeito
          </h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-zinc-400">
            Despeje a regra como você falaria (&ldquo;não promete prazo de reembolso, quem cuida
            é o financeiro&rdquo;). A IA escreve direito, escolhe o bloco certo e salva — depois é
            só revisar na lista.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="ex.: quando o cliente pedir nota fiscal, manda o link do portal da Eduzz e avisa que sai em até 2 dias úteis"
            className="w-full rounded-lg border border-violet-200 dark:border-violet-500/30 bg-white dark:bg-white/5 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100"
          />
          {promptErro && (
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{promptErro}</p>
          )}
          {promptOk && (
            <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
              Salvei em <strong>{blocoLabel(promptOk.bloco)}</strong>: &ldquo;{promptOk.titulo}
              &rdquo; — confira na lista (dá pra editar ou excluir).
            </p>
          )}
          <button
            onClick={organizar}
            disabled={organizando || prompt.trim().length < 10}
            className="mt-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {organizando ? "Organizando…" : "Organizar e salvar"}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-4">
          {form.id ? "Editar item" : "Novo item de treinamento"}
        </h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Bloco</span>
              <select
                value={form.bloco}
                onChange={(e) => setForm({ ...form, bloco: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm"
              >
                {KB_BLOCOS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Ordem</span>
              <input
                type="number"
                value={form.ordem}
                onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) || 0 })}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Título (a pergunta típica)</span>
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder='ex.: "Qual a diferença entre Start e VIP?"'
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Resposta-modelo / procedimento (a IA usa isto)
            </span>
            <textarea
              value={form.conteudo}
              onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
              rows={8}
              placeholder="Escreva a resposta padrão, com links e passo a passo."
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Válido até (opcional) — após essa data a IA para de usar este item
            </span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="date"
                value={form.valido_ate}
                onChange={(e) => setForm({ ...form, valido_ate: e.target.value })}
                className="rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm"
              />
              {form.valido_ate && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, valido_ate: "" })}
                  className="text-xs text-slate-400 dark:text-zinc-500 hover:text-slate-600"
                >
                  limpar
                </button>
              )}
            </div>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Ativo (a IA pode usar)
          </label>

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {saving ? "Salvando…" : form.id ? "Salvar alterações" : "Adicionar"}
            </button>
            {form.id && (
              <button
                onClick={reset}
                className="rounded-lg border border-slate-300 dark:border-white/15 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Lista */}
      <div>
        {byBloco.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 p-8 text-center text-sm text-slate-400 dark:text-zinc-500">
            Nenhum item ainda. Comece pelos 6 blocos do atendimento (ingressos,
            renovação, acesso, dados, pagamento, brindes).
          </div>
        ) : (
          <div className="space-y-5">
            {byBloco.map((b) => (
              <div key={b.key}>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                  {b.label}
                </h3>
                <div className="space-y-2">
                  {b.items.map((it) => (
                    <div
                      key={it.id}
                      className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800 dark:text-zinc-200">
                          {it.titulo}
                          {!it.ativo && (
                            <span className="ml-2 rounded bg-slate-100 dark:bg-white/[0.07] px-1.5 text-[10px] font-medium text-slate-500 dark:text-zinc-400">
                              inativo
                            </span>
                          )}
                          {expirado(it) ? (
                            <span className="ml-2 rounded bg-rose-100 dark:bg-rose-500/15 px-1.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                              expirado · {it.valido_ate!.split("-").reverse().join("/")}
                            </span>
                          ) : (
                            it.valido_ate && (
                              <span className="ml-2 rounded bg-amber-100 dark:bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                vale até {it.valido_ate.split("-").reverse().join("/")}
                              </span>
                            )
                          )}
                        </span>
                        <div className="flex shrink-0 gap-2 text-xs">
                          <button
                            onClick={() => copy(it)}
                            className={copiedId === it.id ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-500 dark:text-zinc-400 hover:text-slate-800"}
                          >
                            {copiedId === it.id ? "Copiado!" : "Copiar"}
                          </button>
                          <button onClick={() => edit(it)} className="text-slate-500 dark:text-zinc-400 hover:text-slate-800">
                            Editar
                          </button>
                          <button onClick={() => remove(it.id)} className="text-rose-500 hover:text-rose-700">
                            Excluir
                          </button>
                        </div>
                      </div>
                      {it.conteudo && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400 line-clamp-3 whitespace-pre-wrap">
                          {it.conteudo}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-slate-400 dark:text-zinc-500">
          Blocos disponíveis: {KB_BLOCOS.map((b) => blocoLabel(b.key)).join(" · ")}.
        </p>
      </div>
    </div>
  );
}
