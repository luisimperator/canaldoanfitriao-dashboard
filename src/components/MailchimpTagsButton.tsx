"use client";

import { useState } from "react";

interface TagRow {
  name: string;
  count: number;
  timeDeVendas: boolean;
}

// Busca as TAGS reais da audiência do Mailchimp (só leitura, não grava nada)
// e lista nome + quantos contatos, marcando as que a regra atual já trata
// como lista de espera do time de vendas. Serve para parar de adivinhar o
// nome das tags e ajustar @/lib/leads ao que existe de fato.
export function MailchimpTagsButton() {
  const [state, setState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [tags, setTags] = useState<TagRow[] | null>(null);

  async function run() {
    setState("running");
    setMessage(null);
    setTags(null);
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
      setMessage(
        `${(json.members ?? 0).toLocaleString("pt-BR")} contatos · ${
          (json.tags ?? []).length
        } tags`
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
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {state === "running" ? "Lendo tags..." : "Ver tags reais"}
      </button>
      {message && (
        <span
          className={`ml-2 text-xs ${state === "error" ? "text-rose-600" : "text-slate-500"}`}
        >
          {message}
        </span>
      )}
      {tags && tags.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
          {tags.map((t) => (
            <li key={t.name} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 min-w-0">
                <code className="text-[11px] text-slate-700 truncate">{t.name}</code>
                {t.timeDeVendas && (
                  <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5">
                    lista de espera
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                {t.count.toLocaleString("pt-BR")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {tags && tags.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Nenhuma tag encontrada na audiência.
        </p>
      )}
    </div>
  );
}
