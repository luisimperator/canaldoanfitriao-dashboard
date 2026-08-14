import Link from "next/link";
import { Card } from "@/components/ui";
import { brl } from "@/lib/format";
import { sum } from "@/lib/metrics";
import type { FinTransaction, FinCategory } from "@/lib/types";

// Espelho da conta do Inter: lançamentos por dia, saldo ao fim de cada dia,
// filtro entradas/saídas, busca e somas do período.
//
// Vive em dois lugares de propósito — embutido no /financeiro (junto do fluxo e
// das despesas, seguindo o mesmo seletor de período) e em página própria no
// menu, para quem quer só conferir o banco sem passar pelos gráficos. O
// componente é o mesmo nos dois; só muda o basePath dos filtros.

const MAX_ROWS = 400;

const fmtDia = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    timeZone: "UTC",
  });

export interface ExtratoParams {
  from?: string;
  to?: string;
  tipo?: string;
  q?: string;
}

export function ExtratoBanco({
  transactions,
  finCategories,
  periodStart,
  periodEnd,
  sp,
  basePath,
}: {
  transactions: FinTransaction[];
  finCategories: FinCategory[];
  periodStart: string;
  periodEnd: string;
  sp: ExtratoParams;
  basePath: string;
}) {
  const catName = new Map(finCategories.map((c) => [c.id, c.name]));
  const tipo = sp.tipo === "entradas" || sp.tipo === "saidas" ? sp.tipo : "tudo";
  const q = (sp.q ?? "").trim().toLowerCase();

  // Saldo acumulado por dia usa o histórico INTEIRO, não só o período — senão o
  // "saldo do dia" mudaria conforme o filtro e deixaria de ser o saldo do banco.
  const netByDay = new Map<string, number>();
  for (const t of transactions) {
    const d = t.transactionDate.slice(0, 10);
    netByDay.set(d, (netByDay.get(d) ?? 0) + (t.direction === "in" ? t.amount : -t.amount));
  }
  const saldoFimDoDia = new Map<string, number>();
  let acc = 0;
  for (const d of [...netByDay.keys()].sort()) {
    acc += netByDay.get(d)!;
    saldoFimDoDia.set(d, acc);
  }

  const matches = (t: FinTransaction) =>
    !q ||
    t.description.toLowerCase().includes(q) ||
    (t.counterparty ?? "").toLowerCase().includes(q);

  const periodo = transactions.filter(
    (t) => t.transactionDate >= periodStart && t.transactionDate <= periodEnd && matches(t)
  );
  const entradasPeriodo = sum(periodo.filter((t) => t.direction === "in").map((t) => t.amount));
  const saidasPeriodo = sum(periodo.filter((t) => t.direction === "out").map((t) => t.amount));

  const listadas = periodo
    .filter((t) => tipo === "tudo" || (tipo === "entradas" ? t.direction === "in" : t.direction === "out"))
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  const truncado = listadas.length > MAX_ROWS;
  const visiveis = listadas.slice(0, MAX_ROWS);

  const dias: { dia: string; txs: FinTransaction[] }[] = [];
  for (const t of visiveis) {
    const d = t.transactionDate.slice(0, 10);
    if (dias.length === 0 || dias[dias.length - 1].dia !== d) dias.push({ dia: d, txs: [] });
    dias[dias.length - 1].txs.push(t);
  }

  const chip = (ativo: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${
      ativo
        ? "bg-rose-600 text-white font-semibold"
        : "bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/15"
    }`;
  const qs = (t: string) => {
    const p = new URLSearchParams();
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (t !== "tudo") p.set("tipo", t);
    if (sp.q) p.set("q", sp.q);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={`${basePath}${qs("tudo")}`} className={chip(tipo === "tudo")}>
          Tudo
        </Link>
        <Link href={`${basePath}${qs("entradas")}`} className={chip(tipo === "entradas")}>
          Só entradas
        </Link>
        <Link href={`${basePath}${qs("saidas")}`} className={chip(tipo === "saidas")}>
          Só saídas
        </Link>
        <form method="get" action={basePath} className="flex items-center gap-1.5 ml-auto">
          {sp.from && <input type="hidden" name="from" value={sp.from} />}
          {sp.to && <input type="hidden" name="to" value={sp.to} />}
          {tipo !== "tudo" && <input type="hidden" name="tipo" value={tipo} />}
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Buscar (ex.: eduzz, aluguel, pix...)"
            className="w-48 sm:w-64 rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-sm"
          />
          <button className="rounded-lg bg-slate-900 dark:bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 dark:hover:bg-violet-500">
            Buscar
          </button>
        </form>
      </div>

      <Card title={`Extrato · ${fmtDia(periodStart)} → ${fmtDia(periodEnd)}`}>
        {dias.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Nenhum lançamento no período{q ? ` para “${sp.q}”` : ""}.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {dias.map(({ dia, txs }) => (
              <div key={dia} className="py-2">
                <div className="flex items-baseline justify-between mb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                    {fmtDia(dia)}
                  </p>
                  <p className="text-[11px] tabular-nums text-slate-400 dark:text-zinc-500">
                    saldo do dia: {brl(saldoFimDoDia.get(dia) ?? 0)}
                  </p>
                </div>
                <ul className="space-y-1">
                  {txs.map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-slate-700 dark:text-zinc-300">
                          {t.description || "(sem descrição)"}
                        </span>
                        {(t.counterparty || t.categoryId) && (
                          <span className="block truncate text-[11px] text-slate-400 dark:text-zinc-500">
                            {[t.counterparty, t.categoryId ? catName.get(t.categoryId) : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 tabular-nums text-sm font-semibold ${
                          t.direction === "in"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-slate-900 dark:text-zinc-100"
                        }`}
                      >
                        {t.direction === "in" ? "+" : "−"}
                        {brl(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 border-t border-slate-200 dark:border-white/10 pt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-slate-600 dark:text-zinc-400">
            Soma do período{q ? ` (filtro “${sp.q}”)` : ""}:
          </span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            +{brl(entradasPeriodo)}
          </span>
          <span className="font-semibold text-slate-900 dark:text-zinc-100 tabular-nums">
            −{brl(saidasPeriodo)}
          </span>
          <span
            className={`font-semibold tabular-nums ${
              entradasPeriodo - saidasPeriodo >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            = {brl(entradasPeriodo - saidasPeriodo)}
          </span>
          <span className="text-slate-400 dark:text-zinc-500">
            {listadas.length} lançamento{listadas.length === 1 ? "" : "s"}
            {truncado ? ` (mostrando os ${MAX_ROWS} mais recentes)` : ""}
          </span>
        </div>
      </Card>
    </>
  );
}
