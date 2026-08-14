import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { isoToday, monthKey, monthlyCashflow, spendByCategory, sum } from "@/lib/metrics";
import { brl, monthLabel } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { CashflowChart, SpendByCategoryChart } from "@/components/charts";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ExtratoBanco } from "@/components/ExtratoBanco";

export const dynamic = "force-dynamic";

// Financeiro: saldo + fluxo mensal + despesas por categoria + o extrato do
// Inter embutido (mesmo componente da página Extrato do banco, seguindo o
// seletor de período daqui). Provisão de caixa e Extrato têm página própria.

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

  const periodLabel = `${monthLabel(fromM)} – ${monthLabel(toM)}`;

  // Saldo atual do banco (histórico inteiro) — os KPIs usam.
  const saldoAtual = sum(
    data.finTransactions.map((t) => (t.direction === "in" ? t.amount : -t.amount))
  );

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

      <ExtratoBanco
        transactions={data.finTransactions}
        finCategories={data.finCategories}
        periodStart={periodStart}
        periodEnd={periodEnd}
        sp={sp}
        basePath="/financeiro"
      />

      <p className="mt-4 text-xs text-slate-400 dark:text-zinc-500">
        Espelho da conta PJ do Banco Inter via sync automático (a cada ~30 min) — pode haver
        pequena defasagem em relação ao app do banco. “Saldo do dia” = saldo acumulado no fim
        daquele dia considerando todo o histórico importado.
      </p>
    </div>
  );
}
