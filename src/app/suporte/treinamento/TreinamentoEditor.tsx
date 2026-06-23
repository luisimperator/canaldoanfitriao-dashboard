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
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm h-fit lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          {form.id ? "Editar item" : "Novo item de treinamento"}
        </h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Bloco</span>
              <select
                value={form.bloco}
                onChange={(e) => setForm({ ...form, bloco: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {KB_BLOCOS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Ordem</span>
              <input
                type="number"
                value={form.ordem}
                onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) || 0 })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Título (a pergunta típica)</span>
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder='ex.: "Qual a diferença entre Start e VIP?"'
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">
              Resposta-modelo / procedimento (a IA usa isto)
            </span>
            <textarea
              value={form.conteudo}
              onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
              rows={8}
              placeholder="Escreva a resposta padrão, com links e passo a passo."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">
              Válido até (opcional) — após essa data a IA para de usar este item
            </span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="date"
                value={form.valido_ate}
                onChange={(e) => setForm({ ...form, valido_ate: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {form.valido_ate && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, valido_ate: "" })}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  limpar
                </button>
              )}
            </div>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Ativo (a IA pode usar)
          </label>

          {error && <p className="text-sm text-rose-600">{error}</p>}

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
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lista */}
      <div>
        {byBloco.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            Nenhum item ainda. Comece pelos 6 blocos do atendimento (ingressos,
            renovação, acesso, dados, pagamento, brindes).
          </div>
        ) : (
          <div className="space-y-5">
            {byBloco.map((b) => (
              <div key={b.key}>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {b.label}
                </h3>
                <div className="space-y-2">
                  {b.items.map((it) => (
                    <div
                      key={it.id}
                      className="rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {it.titulo}
                          {!it.ativo && (
                            <span className="ml-2 rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">
                              inativo
                            </span>
                          )}
                          {expirado(it) ? (
                            <span className="ml-2 rounded bg-rose-100 px-1.5 text-[10px] font-medium text-rose-600">
                              expirado · {it.valido_ate!.split("-").reverse().join("/")}
                            </span>
                          ) : (
                            it.valido_ate && (
                              <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-medium text-amber-700">
                                vale até {it.valido_ate.split("-").reverse().join("/")}
                              </span>
                            )
                          )}
                        </span>
                        <div className="flex shrink-0 gap-2 text-xs">
                          <button
                            onClick={() => copy(it)}
                            className={copiedId === it.id ? "text-emerald-600 font-medium" : "text-slate-500 hover:text-slate-800"}
                          >
                            {copiedId === it.id ? "Copiado!" : "Copiar"}
                          </button>
                          <button onClick={() => edit(it)} className="text-slate-500 hover:text-slate-800">
                            Editar
                          </button>
                          <button onClick={() => remove(it.id)} className="text-rose-500 hover:text-rose-700">
                            Excluir
                          </button>
                        </div>
                      </div>
                      {it.conteudo && (
                        <p className="mt-1 text-xs text-slate-500 line-clamp-3 whitespace-pre-wrap">
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
        <p className="mt-4 text-xs text-slate-400">
          Blocos disponíveis: {KB_BLOCOS.map((b) => blocoLabel(b.key)).join(" · ")}.
        </p>
      </div>
    </div>
  );
}
