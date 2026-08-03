"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Tela de classificação: cada lançamento do extrato ganha (ou troca de)
// categoria. Trocar na mão marca category_source='manual' — imune às regras.
// Dá também pra transformar o lançamento numa regra ("todo Pix pra fulano é
// equipe"), que vale pra todo o histórico e pros lançamentos futuros.
//
// Sem cópia local dos dados: toda mutação chama a API e dá router.refresh(),
// e a página server manda os dados frescos. Cópia local dessincroniza na
// primeira regra que reclassifica 40 lançamentos de uma vez.

export interface CatOpt {
  id: string;
  name: string;
  groupName: string;
}

export interface TxRow {
  id: string;
  data: string; // ISO
  valor: number;
  direction: "in" | "out";
  descricao: string;
  categoriaId: string | null;
  manual: boolean;
}

export interface RegraRow {
  id: string;
  prioridade: number;
  padrao: string;
  direction: string | null;
  categoria: string;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtDia = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

// Núcleo do favorecido a partir da descrição do Inter, pros dois formatos que
// convivem no extrato: "Pix enviado — Nome" e 'Pix recebido: "Cp :123-NOME"'.
function padraoSugerido(descricao: string): string {
  const emDash = descricao.split("—")[1];
  if (emDash && emDash.trim().length >= 3) return `%${emDash.trim()}%`;
  const aspas = descricao.match(/"([^"]+)"/)?.[1] ?? "";
  const nucleo = aspas
    .replace(/Cp\s*:?\s*\d+-?/i, "")
    .replace(/^[\d\s]+/, "")
    .trim();
  if (nucleo.length >= 3) return `%${nucleo}%`;
  return "";
}

type Filtro = "sem" | "tudo" | "manual";
const MAX_ROWS = 300;

export function ClassificarLancamentos({
  txs,
  categorias,
  regras,
}: {
  txs: TxRow[];
  categorias: CatOpt[];
  regras: RegraRow[];
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("sem");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // id da linha em voo
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // linha com o mini-form de regra aberto + estado do form
  const [regraDe, setRegraDe] = useState<string | null>(null);
  const [regraPadrao, setRegraPadrao] = useState("");
  const [regraCat, setRegraCat] = useState("");
  const [mostrarRegras, setMostrarRegras] = useState(false);

  const grupos = useMemo(() => {
    const g = new Map<string, CatOpt[]>();
    for (const c of categorias) {
      const arr = g.get(c.groupName) ?? [];
      arr.push(c);
      g.set(c.groupName, arr);
    }
    return [...g.entries()];
  }, [categorias]);

  const filtradas = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return txs.filter((t) => {
      if (filtro === "sem" && t.categoriaId !== null) return false;
      if (filtro === "manual" && !t.manual) return false;
      if (ql && !t.descricao.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [txs, filtro, q]);
  const visiveis = filtradas.slice(0, MAX_ROWS);

  async function chamar(method: string, body: unknown, linha?: string) {
    setBusy(linha ?? "__global");
    setErro(null);
    try {
      const res = await fetch("/api/financeiro/classificar", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(j.error ?? `Erro ${res.status}`);
        return false;
      }
      if (j.reclass && typeof j.reclass.sem_categoria === "number") {
        setAviso(
          `Regras reaplicadas: ${j.reclass.classificados} lançamentos classificados, ${j.reclass.sem_categoria} sem categoria.`
        );
      }
      router.refresh();
      return true;
    } catch {
      setErro("Falha de rede");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function abrirRegra(t: TxRow) {
    setRegraDe(t.id);
    setRegraPadrao(padraoSugerido(t.descricao));
    setRegraCat(t.categoriaId ?? "");
    setAviso(null);
  }

  const semCategoria = txs.filter((t) => t.categoriaId === null).length;
  const chip = (ativo: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${
      ativo
        ? "bg-rose-600 text-white font-semibold"
        : "bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/15"
    }`;
  const campo =
    "rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-2 py-1 text-xs text-slate-900 dark:text-zinc-100";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className={chip(filtro === "sem")} onClick={() => setFiltro("sem")}>
          Sem categoria ({semCategoria})
        </button>
        <button className={chip(filtro === "tudo")} onClick={() => setFiltro("tudo")}>
          Tudo
        </button>
        <button className={chip(filtro === "manual")} onClick={() => setFiltro("manual")}>
          Manuais
        </button>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar na descrição..."
          className="w-48 sm:w-64 rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-sm ml-auto"
        />
        <button
          onClick={() => chamar("POST", { action: "reclassificar" })}
          disabled={busy !== null}
          className="rounded-lg bg-slate-900 dark:bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 dark:hover:bg-violet-500 disabled:opacity-50"
        >
          {busy === "__global" ? "Reaplicando..." : "↻ Reaplicar regras"}
        </button>
      </div>

      {erro && <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">{erro}</p>}
      {aviso && <p className="mb-2 text-sm text-emerald-700 dark:text-emerald-400">{aviso}</p>}

      <div className="divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f]">
        {visiveis.length === 0 && (
          <p className="p-4 text-sm text-slate-500 dark:text-zinc-400">
            Nada aqui{filtro === "sem" ? " — tudo classificado." : "."}
          </p>
        )}
        {visiveis.map((t) => (
          <div key={t.id} className="p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="w-16 shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-zinc-500">
                {fmtDia(t.data)}
              </span>
              <span
                className={`w-24 shrink-0 text-sm font-semibold tabular-nums ${
                  t.direction === "in"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-900 dark:text-zinc-100"
                }`}
              >
                {t.direction === "in" ? "+" : "−"}
                {brl(t.valor)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-zinc-300">
                {t.descricao}
              </span>
              {t.manual && (
                <span className="rounded-full bg-violet-100 dark:bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                  manual
                </span>
              )}
              <select
                value={t.categoriaId ?? ""}
                disabled={busy === t.id}
                onChange={(e) =>
                  chamar("PATCH", { id: t.id, categoryId: e.target.value || null }, t.id)
                }
                className={`${campo} max-w-[15rem] ${t.categoriaId === null ? "border-amber-400 dark:border-amber-500/60" : ""}`}
              >
                <option value="">— sem categoria{t.manual ? " (voltar pra regra)" : ""} —</option>
                {grupos.map(([grupo, cats]) => (
                  <optgroup key={grupo} label={grupo}>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                onClick={() => (regraDe === t.id ? setRegraDe(null) : abrirRegra(t))}
                className="text-[11px] text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400"
                title="Criar uma regra a partir deste lançamento — vale pro histórico e pros próximos"
              >
                {regraDe === t.id ? "fechar" : "regra…"}
              </button>
            </div>

            {regraDe === t.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] p-2">
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Todo lançamento {t.direction === "in" ? "de entrada" : "de saída"} casando com
                </span>
                <input
                  value={regraPadrao}
                  onChange={(e) => setRegraPadrao(e.target.value)}
                  className={`${campo} w-56`}
                  placeholder="%NOME DO FAVORECIDO%"
                />
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">vira</span>
                <select
                  value={regraCat}
                  onChange={(e) => setRegraCat(e.target.value)}
                  className={`${campo} max-w-[13rem]`}
                >
                  <option value="">— escolha —</option>
                  {grupos.map(([grupo, cats]) => (
                    <optgroup key={grupo} label={grupo}>
                      {cats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  disabled={
                    busy !== null || !regraCat || regraPadrao.replace(/%/g, "").trim().length < 3
                  }
                  onClick={async () => {
                    const ok = await chamar(
                      "POST",
                      { padrao: regraPadrao, direction: t.direction, categoryId: regraCat },
                      t.id
                    );
                    if (ok) setRegraDe(null);
                  }}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Criar regra
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {filtradas.length > MAX_ROWS && (
        <p className="mt-2 text-xs text-slate-400 dark:text-zinc-500">
          Mostrando os {MAX_ROWS} mais recentes de {filtradas.length} — use a busca pra achar o
          resto.
        </p>
      )}

      <div className="mt-6">
        <button
          onClick={() => setMostrarRegras((m) => !m)}
          className="text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:underline"
        >
          {mostrarRegras ? "▾" : "▸"} Regras ativas ({regras.length})
        </button>
        {mostrarRegras && (
          <div className="mt-2 divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f]">
            {regras.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 text-sm">
                <span className="w-8 shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-zinc-500">
                  {r.prioridade}
                </span>
                <code className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-zinc-300">
                  {r.padrao}
                </code>
                <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                  {r.direction === "in" ? "entrada" : r.direction === "out" ? "saída" : "ambos"}
                </span>
                <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                  → {r.categoria}
                </span>
                <button
                  onClick={() => chamar("DELETE", { ruleId: r.id })}
                  disabled={busy !== null}
                  className="text-[11px] text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400"
                >
                  apagar
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400 dark:text-zinc-500">
          Menor prioridade roda primeiro; a primeira regra que casar vence. Lançamento marcado
          como <strong>manual</strong> é imune às regras — pra devolvê-lo a elas, escolha
          &ldquo;sem categoria (voltar pra regra)&rdquo; no seletor.
        </p>
      </div>
    </div>
  );
}
