"use client";

import { useState } from "react";

interface TagRow {
  name: string;
  count: number;
  timeDeVendas: boolean;
}

interface MergeField {
  tag: string;
  name: string;
  filled: number;
  examples: string[];
}

// Busca as TAGS reais da audiência do Mailchimp (só leitura, não grava nada)
// e lista nome + quantos contatos, marcando as que a regra atual já trata
// como lista de espera do time de vendas. Serve para parar de adivinhar o
// nome das tags e ajustar @/lib/leads ao que existe de fato.
export function MailchimpTagsButton() {
  const [state, setState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [tags, setTags] = useState<TagRow[] | null>(null);
  const [mergeFields, setMergeFields] = useState<MergeField[] | null>(null);

  async function run() {
    setState("running");
    setMessage(null);
    setTags(null);
    setMergeFields(null);
    try {
      const res = await fetch("/api/sync/mailchimp", { method: "GET" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(json.error ?? `Erro ${res.status}`);
        return;
      }
      setState("ok");
      setTags(json.tags ?? []);
      setMergeFields(json.mergeFields ?? []);
      setMessage(
        `${(json.members ?? 0).toLocaleString("pt-BR")} contatos · ${
          (json.tags ?? []).length
        } tags · ${(json.mergeFields ?? []).length} campos`
      );
    } catch {
      setState("error");
      setMessage("Falha de rede");
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={run}
        disabled={state === "running"}
        className="rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-60"
      >
        {state === "running" ? "Lendo Mailchimp..." : "Ver tags e campos (UTM/origem)"}
      </button>
      {message && (
        <span
          className={`ml-2 text-xs ${state === "error" ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-zinc-400"}`}
        >
          {message}
        </span>
      )}
      {tags && tags.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.06] rounded-lg border border-slate-200 dark:border-white/10">
          {tags.map((t) => (
            <li key={t.name} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 min-w-0">
                <code className="text-[11px] text-slate-700 dark:text-zinc-300 truncate">{t.name}</code>
                {t.timeDeVendas && (
                  <span className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-semibold px-1.5 py-0.5">
                    lista de espera
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-zinc-500">
                {t.count.toLocaleString("pt-BR")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {tags && tags.length === 0 && (
        <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
          Nenhuma tag encontrada na audiência.
        </p>
      )}

      {mergeFields && mergeFields.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            Campos (merge fields) — onde mora UTM/VIDORIGEM
          </p>
          <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.06] rounded-lg border border-slate-200 dark:border-white/10">
            {mergeFields.map((f) => (
              <li key={f.tag} className="px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <code className="text-[11px] text-slate-700 dark:text-zinc-300">{f.tag}</code>
                    <span className="ml-1 text-[11px] text-slate-400 dark:text-zinc-500 truncate">{f.name}</span>
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-zinc-500">
                    {f.filled.toLocaleString("pt-BR")} preenchidos
                  </span>
                </div>
                {f.examples.length > 0 && (
                  <div className="mt-0.5 text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                    ex.: {f.examples.join(" · ")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
