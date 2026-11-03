"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Filtro de tags do gráfico de MQLs/Leads: por padrão entram todas; tirar uma
// tag tira do gráfico todo lead que tem essa tag (ex.: as da Black).
export function FiltroTags({
  tags,
  contagem,
  tiradas,
  onChange,
}: {
  tags: string[];
  /** quantos leads/MQLs de cada tag (mesma ordem de `tags`) no período do gráfico */
  contagem: number[];
  tiradas: ReadonlySet<string>;
  onChange: (tiradas: Set<string>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  // Mais usadas no período primeiro; as que não aparecem no período vão pro fim.
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return tags
      .map((t, i) => ({ t, n: contagem[i] ?? 0 }))
      .filter((x) => !q || x.t.includes(q))
      .sort((a, b) => b.n - a.n || a.t.localeCompare(b.t));
  }, [tags, contagem, busca]);

  const alternar = (t: string) => {
    const novo = new Set(tiradas);
    if (novo.has(t)) novo.delete(t);
    else novo.add(t);
    onChange(novo);
  };

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
          tiradas.size > 0
            ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
            : "border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-800"
        }`}
      >
        Tags: {tiradas.size === 0 ? "todas" : `${tiradas.size} fora`}
        <span aria-hidden>▾</span>
      </button>
      {aberto && (
        <div className="absolute left-0 z-20 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] shadow-lg p-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar tag (ex.: black)"
            autoFocus
            className="w-full rounded-md border border-slate-200 dark:border-white/10 bg-transparent px-2 py-1 text-xs text-slate-700 dark:text-zinc-200 outline-none focus:border-violet-500"
          />
          <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
            <button
              type="button"
              onClick={() => {
                const novo = new Set(tiradas);
                for (const x of lista) novo.delete(x.t);
                onChange(novo);
              }}
              className="text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 underline"
            >
              {busca ? "Incluir as da busca" : "Incluir todas"}
            </button>
            <button
              type="button"
              onClick={() => {
                const novo = new Set(tiradas);
                for (const x of lista) novo.add(x.t);
                onChange(novo);
              }}
              className="text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 underline"
            >
              {busca ? "Tirar as da busca" : "Tirar todas"}
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {lista.map((x) => (
              <li key={x.t}>
                <label className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50 dark:hover:bg-white/[0.04] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!tiradas.has(x.t)}
                    onChange={() => alternar(x.t)}
                    className="accent-violet-600"
                  />
                  <span
                    className={`flex-1 truncate ${
                      tiradas.has(x.t) ? "text-slate-400 line-through dark:text-zinc-500" : "text-slate-700 dark:text-zinc-200"
                    }`}
                  >
                    {x.t}
                  </span>
                  <span className="tabular-nums text-slate-400 dark:text-zinc-500">
                    {x.n.toLocaleString("pt-BR")}
                  </span>
                </label>
              </li>
            ))}
            {lista.length === 0 && (
              <li className="px-1.5 py-2 text-xs text-slate-400 dark:text-zinc-500">Nenhuma tag com esse nome.</li>
            )}
          </ul>
          <p className="pt-1.5 text-[11px] text-slate-400 dark:text-zinc-500">
            Lead com tag tirada sai do gráfico. Lead sem tag sempre entra.
          </p>
        </div>
      )}
    </div>
  );
}
