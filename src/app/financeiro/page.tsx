import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { isoToday, monthKey, monthlyCashflow, spendByCategory, sum } from "@/lib/metrics";
import { brl, shortDate, monthLabel } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { CashflowChart, SpendByCategoryChart } from "@/components/charts";
import { DateRangePicker } from "@/components/DateRangePicker";

export const dynamic = "force-dynamic";

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

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
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
  const recent = [...data.finTransactions]
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
    .slice(0, 12);

  const periodLabel = `${monthLabel(fromM)} – ${monthLabel(toM)}`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Financeiro"
          subtitle="Entradas e saídas da conta do Canal do Anfitrião (Banco Inter)"
        />
        <Link
          href="/financeiro/projecao"
          className="shrink-0 rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
        >
          📈 Projeção →
        </Link>
        <Link
          href="/financeiro/extrato"
          className="shrink-0 rounded-lg bg-slate-900 dark:bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 dark:hover:bg-violet-500"
        >
          🏦 Extrato do banco →
        </Link>
      </div>
      <DemoBanner show={data.isDemo} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500 dark:text-zinc-400">Período (fluxo e despesas)</span>
        <DateRangePicker />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
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

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={`Fluxo de caixa (${periodLabel})`}>
          <CashflowChart data={cashflow} />
        </Card>
        <Card title={`Despesas por categoria (${periodLabel})`}>
          <SpendByCategoryChart data={categories} />
        </Card>

        <Card title="Últimos lançamentos">
          <table className="w-full text-sm">
            <tbody>
              {recent.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 dark:border-white/[0.04] last:border-0">
                  <td className="py-2 text-slate-400 dark:text-zinc-500 w-14">{shortDate(t.transactionDate)}</td>
                  <td className="py-2 text-slate-700 dark:text-zinc-300">
                    {t.description}
                    <span className="block text-xs text-slate-400 dark:text-zinc-500">
                      {(t.categoryId && catName.get(t.categoryId)) || "Sem categoria"}
                    </span>
                  </td>
                  <td
                    className={`py-2 text-right font-medium whitespace-nowrap ${
                      t.direction === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {t.direction === "in" ? "+" : "−"} {brl(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
