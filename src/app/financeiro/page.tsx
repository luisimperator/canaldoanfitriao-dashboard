import { getDashboardData } from "@/lib/data";
import { daysAgo, isoToday, monthKey, monthlyCashflow, spendByCategory, sum } from "@/lib/metrics";
import { brl, shortDate } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { CashflowChart, SpendByCategoryChart } from "@/components/charts";
import { UploadExtrato } from "@/components/UploadExtrato";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const data = await getDashboardData();
  const today = isoToday();
  const month = monthKey(today);
  const start90 = daysAgo(89);

  const monthTx = data.finTransactions.filter(
    (t) => monthKey(t.transactionDate) === month
  );
  const inMonth = sum(monthTx.filter((t) => t.direction === "in").map((t) => t.amount));
  const outMonth = sum(monthTx.filter((t) => t.direction === "out").map((t) => t.amount));

  const cashflow = monthlyCashflow(data, 6);
  const lastClosed = cashflow.length >= 2 ? cashflow[cashflow.length - 2] : null;

  const categories = spendByCategory(data, start90, today);
  const catName = new Map(data.finCategories.map((c) => [c.id, c.name]));
  const recent = [...data.finTransactions]
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
    .slice(0, 12);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Entradas e saídas da conta do Canal do Anfitrião (Banco Inter)"
      />
      <DemoBanner show={data.isDemo} />

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
        <Card title="Fluxo de caixa mensal">
          <CashflowChart data={cashflow} />
        </Card>
        <Card title="Despesas por categoria (90 dias)">
          <SpendByCategoryChart data={categories} />
        </Card>

        <Card title="Importar extrato do Inter">
          <UploadExtrato />
        </Card>

        <Card title="Últimos lançamentos">
          <table className="w-full text-sm">
            <tbody>
              {recent.map((t) => (
                <tr key={t.id} className="border-b border-white/5 last:border-0">
                  <td className="py-2 text-slate-400 w-14">{shortDate(t.transactionDate)}</td>
                  <td className="py-2 text-slate-200">
                    {t.description}
                    <span className="block text-xs text-slate-400">
                      {(t.categoryId && catName.get(t.categoryId)) || "Sem categoria"}
                    </span>
                  </td>
                  <td
                    className={`py-2 text-right font-medium whitespace-nowrap ${
                      t.direction === "in" ? "text-emerald-600" : "text-rose-600"
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
