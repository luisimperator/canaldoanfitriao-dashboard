import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { isoToday, monthKey, monthlyCashflow, spendByCategory, sum } from "@/lib/metrics";
import { brl, monthLabel } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { CashflowChart, SpendByCategoryChart } from "@/components/charts";
import { DateRangePicker } from "@/components/DateRangePicker";
import type { FinTransaction } from "@/lib/types";

export const dynamic = "force-dynamic";

// Financeiro: saldo + fluxo mensal + despesas por categoria + o EXTRATO
// completo do Inter embutido (saldo do dia, filtro entradas/saídas, busca e
// somas do período). A Provisão de caixa vive em página própria (menu).

const MAX_ROWS = 400;

function shiftYM(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function lastDay(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const fmtDia = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    timeZone: "UTC",
  });

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tipo?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const data = await getDashboardData();
  const today = isoToday();
  const month = monthKey(today);
  const re = /^\d{4}-\d{2}(-\d{2})?$/;
  const rawTo = sp.to && re.test(sp.to) ? sp.to : month;
  const rawFrom = sp.from && re.test(sp.from) ? sp.from : shiftYM(rawTo.slice(0, 7), -5);
  const fromM = rawFrom.slice(0, 7);
  const toM = rawTo.slice(0, 7);

  const monthTx = data.finTransactions.filter((t) => monthKey(t.transactionDate) === month);
  const inMonth = sum(monthTx.filter((t) => t.direction === "in").map((t) => t.amount));
  const outMonth = sum(monthTx.filter((t) => t.direction === "out").map((t) => t.amount));

  const cashflow = monthlyCashflow(data, 36).filter((c) => c.month >= fromM && c.month <= toM);
  const lastClosed = cashflow.length >= 2 ? cashflow[cashflow.length - 2] : null;

  const periodStart = rawFrom.length > 7 ? rawFrom : `${fromM}-01`;
  const periodEndRaw = rawTo.length > 7 ? rawTo : lastDay(toM);
  const periodEnd = periodEndRaw > today ? today : periodEndRaw;
  const categories = spendByCategory(data, periodStart, periodEnd);
  const catName = new Map(data.finCategories.map((c) => [c.id, c.name]));

  const periodLabel = `${monthLabel(fromM)} – ${monthLabel(toM)}`;

  // ---------- Extrato embutido (espelho do banco) ----------
  const all = data.finTransactions;
  const tipo = sp.tipo === "entradas" || sp.tipo === "saidas" ? sp.tipo : "tudo";
  const q = (sp.q ?? "").trim().toLowerCase();

  // Saldo atual e saldo acumulado por dia (histórico inteiro).
  const saldoAtual = sum(all.map((t) => (t.direction === "in" ? t.amount : -t.amount)));
  const netByDay = new Map<string, number>();
  for (const t of all) {
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

  const periodo = all.filter(
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
      ativo ? "bg-rose-600 text-white font-semibold" : "bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/15"
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
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Financeiro"
          subtitle="Saldo, fluxo e extrato da conta do Canal do Anfitrião (Banco Inter)"
        />
        <Link
          href="/financeiro/provisao"
          className="shrink-0 rounded-lg bg-slate-900 dark:bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 dark:hover:bg-violet-500"
        >
          💧 Provisão de caixa →
        </Link>
      </div>
      <DemoBanner show={data.isDemo} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500 dark:text-zinc-400">
          Período (fluxo, despesas e extrato)
        </span>
        <DateRangePicker />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <KpiCard label="Saldo atual" value={brl(saldoAtual)} tone={saldoAtual >= 0 ? "good" : "bad"} />
        <KpiCard label="Entradas no mês" value={brl(inMonth)} tone="good" />
        <KpiCard label="Saídas no mês" value={brl(outMonth)} tone="bad" />
        <KpiCard
          label="Resultado do mês"
          value={brl(inMonth - outMonth)}
          tone={inMonth - outMonth >= 0 ? "good" : "bad"}
        />
        <KpiCard
          label="Resultado do mês anterior"
          value={lastClosed ? brl(lastClosed.resultado) : "—"}
          hint={lastClosed ? `entradas ${brl(lastClosed.entradas)}` : undefined}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title={`Fluxo de caixa (${periodLabel})`}>
          <CashflowChart data={cashflow} />
        </Card>
        <Card title={`Despesas por categoria (${periodLabel})`}>
          <SpendByCategoryChart data={categories} />
        </Card>
      </div>

      {/* ---------- Extrato ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={`/financeiro${qs("tudo")}`} className={chip(tipo === "tudo")}>
          Tudo
        </Link>
        <Link href={`/financeiro${qs("entradas")}`} className={chip(tipo === "entradas")}>
          Só entradas
        </Link>
        <Link href={`/financeiro${qs("saidas")}`} className={chip(tipo === "saidas")}>
          Só saídas
        </Link>
        <form method="get" className="flex items-center gap-1.5 ml-auto">
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
                          t.direction === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-zinc-100"
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
          <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">+{brl(entradasPeriodo)}</span>
          <span className="font-semibold text-slate-900 dark:text-zinc-100 tabular-nums">−{brl(saidasPeriodo)}</span>
          <span
            className={`font-semibold tabular-nums ${
              entradasPeriodo - saidasPeriodo >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
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

      <p className="mt-4 text-xs text-slate-400 dark:text-zinc-500">
        Espelho da conta PJ do Banco Inter via sync automático (a cada ~30 min) — pode haver
        pequena defasagem em relação ao app do banco. “Saldo do dia” = saldo acumulado no fim
        daquele dia considerando todo o histórico importado.
      </p>
    </div>
  );
}
