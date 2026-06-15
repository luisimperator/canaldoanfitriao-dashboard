import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import {
  capacityAnalysis,
  isoToday,
  monthKey,
  paidSales,
  sellerStats,
} from "@/lib/metrics";
import { brl, monthLabel, num } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { SalesBySellerChart, TeamHistoryChart } from "@/components/charts";

export const dynamic = "force-dynamic";

function shiftMonth(mk: string, delta: number): string {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastDayOf(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  return `${mk}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

function monthTitle(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const data = await getDashboardData();
  const today = isoToday();
  const currentMonth = monthKey(today);

  const { mes } = await searchParams;
  const selectedMonth =
    mes && /^\d{4}-\d{2}$/.test(mes) && mes <= currentMonth ? mes : currentMonth;
  const isCurrentMonth = selectedMonth === currentMonth;
  const refDate = isCurrentMonth ? today : lastDayOf(selectedMonth);
  const firstMonth = monthKey(
    paidSales(data.sales).reduce(
      (min, s) => (s.saleDate < min ? s.saleDate : min),
      today
    )
  );

  const stats = sellerStats(data, refDate);
  const cap = capacityAnalysis(data);

  // Série mensal de faturamento por vendedor (últimos 6 meses)
  const sellerName = new Map(data.sellers.map((s) => [s.id, s.name]));
  const monthsSet = new Set<string>();
  const revenue = new Map<string, number>(); // `${month}|${sellerName}`
  for (const sale of paidSales(data.sales)) {
    const mk = monthKey(sale.saleDate);
    monthsSet.add(mk);
    const name = sellerName.get(sale.sellerId) ?? "Sem vendedor";
    const key = `${mk}|${name}`;
    revenue.set(key, (revenue.get(key) ?? 0) + sale.amount);
  }
  const months = [...monthsSet].sort().slice(-6);
  const activeNames = data.sellers.filter((s) => s.isActive).map((s) => s.name);
  const dayOfMonthNow = Number(today.slice(8, 10));
  const daysInCurrentMonth = Number(lastDayOf(currentMonth).slice(8, 10));
  const monthly = months.map((mk) => {
    const row: Record<string, string | number> = { month: monthLabel(mk) };
    for (const name of activeNames) {
      const real = Math.round(revenue.get(`${mk}|${name}`) ?? 0);
      row[name] = real;
      row[`${name}__proj`] =
        mk === currentMonth && dayOfMonthNow > 0
          ? Math.max(0, Math.round((real / dayOfMonthNow) * daysInCurrentMonth) - real)
          : 0;
    }
    return row;
  });

  // História completa do time comercial (todos os vendedores, atuais e antigos):
  // total vendido pelo time em cada mês, do primeiro mês com venda atribuída até hoje.
  const allSellerNames = data.sellers.map((s) => s.name);
  const teamByMonth = (mk: string) =>
    allSellerNames.reduce((a, n) => a + (revenue.get(`${mk}|${n}`) ?? 0), 0);
  const teamMonths: string[] = [];
  {
    const withSeller = [...monthsSet].sort().filter((mk) => teamByMonth(mk) > 0);
    if (withSeller.length > 0) {
      for (let mk = withSeller[0]; mk <= currentMonth; mk = shiftMonth(mk, 1)) {
        teamMonths.push(mk);
      }
    }
  }
  // Mês corrente ganha a projeção pelo ritmo (run rate): faturado ÷ dias
  // corridos × dias do mês, exibida como complemento visual da barra.
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = Number(lastDayOf(currentMonth).slice(8, 10));
  const teamHistory = teamMonths.map((mk) => {
    const realizado = Math.round(teamByMonth(mk));
    const projecao =
      mk === currentMonth && dayOfMonth > 0
        ? Math.max(0, Math.round((realizado / dayOfMonth) * daysInMonth) - realizado)
        : 0;
    return { month: monthLabel(mk), realizado, projecao };
  });
  const teamTotal = teamMonths.reduce((acc, mk) => acc + teamByMonth(mk), 0);

  const capTone =
    cap.verdict === "pode_contratar" ? "good" : cap.verdict === "quase" ? "warn" : "bad";
  const capHeadline =
    cap.verdict === "pode_contratar"
      ? "✅ O volume de leads já sustenta mais um vendedor"
      : cap.verdict === "quase"
        ? "🟡 Quase: falta pouco lead para sustentar mais um vendedor"
        : cap.verdict === "falta_lead"
          ? "🔴 Ainda não: é preciso gerar mais leads antes de contratar"
          : "Sem dados suficientes para a análise";

  return (
    <div>
      <PageHeader
        title="Vendas & time"
        subtitle="Desempenho por vendedor e análise de capacidade do time"
      />
      <DemoBanner show={data.isDemo} />

      <Card title="Vendas por vendedor" className="mb-4">
        <div className="flex items-center justify-center gap-3 mb-4">
          {selectedMonth > firstMonth ? (
            <Link
              href={`/vendas?mes=${shiftMonth(selectedMonth, -1)}`}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              ◀ {monthLabel(shiftMonth(selectedMonth, -1))}
            </Link>
          ) : (
            <span className="px-3 py-1.5 text-sm text-slate-300">◀</span>
          )}
          <span className="min-w-44 text-center text-sm font-semibold text-slate-900">
            {monthTitle(selectedMonth)}
          </span>
          {!isCurrentMonth ? (
            <Link
              href={`/vendas?mes=${shiftMonth(selectedMonth, 1)}`}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              {monthLabel(shiftMonth(selectedMonth, 1))} ▶
            </Link>
          ) : (
            <span className="px-3 py-1.5 text-sm text-slate-300">▶</span>
          )}
        </div>
        <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm min-w-[640px] tabular-nums">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="py-2">Vendedor</th>
              {isCurrentMonth && <th className="py-2 text-right">Hoje</th>}
              <th className="py-2 text-right">No mês</th>
              <th className="py-2 text-right">Receita no mês</th>
              <th className="py-2 text-right">Mês anterior</th>
              <th className="py-2 text-right">Leads recebidos (mês)</th>
              <th className="py-2 text-right">Leads por venda</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.seller.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5 font-medium text-slate-900">{s.seller.name}</td>
                {isCurrentMonth && <td className="py-2.5 text-right">{num(s.salesToday)}</td>}
                <td className="py-2.5 text-right font-semibold">{num(s.salesMonth)}</td>
                <td className="py-2.5 text-right">{brl(s.revenueMonth)}</td>
                <td className="py-2.5 text-right text-slate-500">{num(s.salesPrevMonth)}</td>
                <td className="py-2.5 text-right text-slate-500">{num(s.leadsAssignedMonth)}</td>
                <td className="py-2.5 text-right">
                  {s.leadsPerSaleMonth !== null ? num(s.leadsPerSaleMonth, 1) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          “Leads por venda” = leads quentes encaminhados ao vendedor no mês ÷ vendas fechadas no
          mês. Quanto menor, melhor o aproveitamento.
        </p>
      </Card>

      {teamHistory.length > 0 && (
        <Card
          title={`Faturamento do time comercial — história completa (${brl(teamTotal)})`}
          className="mb-4"
        >
          <TeamHistoryChart data={teamHistory} />
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Faturamento por vendedor por mês">
          <SalesBySellerChart data={monthly} sellers={activeNames} projected />
        </Card>

        <Card title="Dá para contratar mais um vendedor?">
          <div
            className={`rounded-lg px-4 py-3 mb-4 text-sm font-semibold ${
              capTone === "good"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : capTone === "warn"
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
          >
            {capHeadline}
          </div>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Leads captados (últimos 30 dias)</dt>
              <dd className="font-semibold text-slate-900">{num(cap.leads30d)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Vendas fechadas (últimos 30 dias)</dt>
              <dd className="font-semibold text-slate-900">{num(cap.sales30d)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Leads necessários para 1 venda</dt>
              <dd className="font-semibold text-slate-900">
                {cap.leadsPerSale !== null ? num(cap.leadsPerSale, 1) : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Capacidade de 1 vendedor (vendas/mês)</dt>
              <dd className="font-semibold text-slate-900">{num(cap.sellerMonthlyCapacity)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Leads/mês para ocupar 1 vendedor</dt>
              <dd className="font-semibold text-slate-900">
                {cap.leadsNeededPerSeller !== null ? num(cap.leadsNeededPerSeller) : "—"}
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2.5">
              <dt className="text-slate-600">Vendedores que os leads atuais sustentam</dt>
              <dd className="font-semibold text-slate-900">
                {cap.supportedSellers !== null
                  ? `${num(cap.supportedSellers)} (time atual: ${num(cap.activeSellers)})`
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">
                Leads/mês que faltam para sustentar +1 vendedor
              </dt>
              <dd
                className={`font-semibold ${
                  cap.leadsGapForNextSeller !== null && cap.leadsGapForNextSeller <= 0
                    ? "text-emerald-600"
                    : "text-slate-900"
                }`}
              >
                {cap.leadsGapForNextSeller !== null
                  ? cap.leadsGapForNextSeller <= 0
                    ? `sobram ${num(-cap.leadsGapForNextSeller)}`
                    : num(cap.leadsGapForNextSeller)
                  : "—"}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-slate-400 mt-4">
            A capacidade usa o melhor mês de um vendedor nos últimos 3 meses fechados como
            referência de quanto um vendedor consegue entregar quando tem lead suficiente.
          </p>
        </Card>
      </div>
    </div>
  );
}
