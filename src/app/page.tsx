import { getDashboardData } from "@/lib/data";
import {
  capacityAnalysis,
  dailyLeadSeries,
  daysAgo,
  funnelStages,
  inRange,
  isoToday,
  monthKey,
  paidSales,
  sum,
} from "@/lib/metrics";
import { brl, num } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { LeadsTrendChart, SourcePie } from "@/components/charts";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  organico: "Orgânico",
  outro: "Outro",
};

export default async function VisaoGeralPage() {
  const data = await getDashboardData();
  const today = isoToday();
  const month = monthKey(today);
  const start30 = daysAgo(29);

  const sales = paidSales(data.sales);
  const salesToday = sales.filter((s) => s.saleDate === today);
  const revenueToday = sum(salesToday.map((s) => s.amount));
  const salesMonth = sales.filter((s) => monthKey(s.saleDate) === month);
  const revenueMonth = sum(salesMonth.map((s) => s.amount));
  // Projeção do mês pelo ritmo atual (run rate): faturado ÷ dias corridos × dias do mês.
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const projectedMonth =
    dayOfMonth > 0 ? Math.round((revenueMonth / dayOfMonth) * daysInMonth) : revenueMonth;

  const leadsToday = data.leads.filter((l) => l.createdAt === today).length;
  const leadsMonth = data.leads.filter((l) => monthKey(l.createdAt) === month).length;

  const cap = capacityAnalysis(data);
  const spend30 = sum(
    inRange(data.adSpend, (a) => a.date, start30, today).map((a) => a.amount)
  );
  const cac = cap.sales30d > 0 ? spend30 / cap.sales30d : null;

  const leads30 = inRange(data.leads, (l) => l.createdAt, start30, today);
  const stages = funnelStages(leads30);
  const bySource = Object.entries(
    leads30.reduce<Record<string, number>>((acc, l) => {
      acc[l.source] = (acc[l.source] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([source, value]) => ({ name: SOURCE_LABELS[source] ?? source, value }));

  const capTone =
    cap.verdict === "pode_contratar" ? "good" : cap.verdict === "quase" ? "warn" : "neutral";
  const capLabel =
    cap.verdict === "pode_contratar"
      ? "Dá para contratar +1 vendedor"
      : cap.verdict === "quase"
        ? "Quase lá para +1 vendedor"
        : cap.verdict === "falta_lead"
          ? "Faltam leads para +1 vendedor"
          : "Sem dados suficientes";

  return (
    <div>
      <PageHeader
        title="Visão geral"
        subtitle="Resumo do funil, das vendas e do caixa do Canal do Anfitrião"
      />
      <DemoBanner show={data.isDemo} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          label="Faturamento hoje"
          value={brl(revenueToday)}
          tone="good"
          hint={`${num(salesToday.length)} venda${salesToday.length === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="Faturamento no mês"
          value={brl(revenueMonth)}
          tone="good"
          hint={`${num(salesMonth.length)} vendas · projeção ${brl(projectedMonth)}`}
        />
        <KpiCard label="Leads hoje" value={num(leadsToday)} />
        <KpiCard label="Leads no mês" value={num(leadsMonth)} />
        <KpiCard
          label="Leads por venda (30d)"
          value={cap.leadsPerSale ? num(cap.leadsPerSale, 1) : "—"}
          hint={`${num(cap.leads30d)} leads · ${num(cap.sales30d)} vendas`}
        />
        <KpiCard
          label="Custo por venda (30d)"
          value={cac ? brl(cac) : "—"}
          hint={`${brl(spend30)} em tráfego`}
        />
        <KpiCard
          label="Time de vendas"
          value={`${num(cap.activeSellers)} vendedores`}
          hint={
            cap.supportedSellers !== null
              ? `leads atuais sustentam ${num(cap.supportedSellers)}`
              : undefined
          }
        />
        <KpiCard label="Contratação" value={capLabel} tone={capTone} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Leads por dia (últimos 60 dias)" className="lg:col-span-2">
          <LeadsTrendChart data={dailyLeadSeries(data.leads, 60)} />
        </Card>
        <Card title="Origem dos leads (30 dias)">
          <SourcePie data={bySource} />
        </Card>
        <Card title="Funil (últimos 30 dias)" className="lg:col-span-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
            {stages.map((stage, i) => (
              <div key={stage.label} className="rounded-lg bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-slate-500">{stage.label}</div>
                <div className="text-xl font-bold text-slate-50 mt-1">{num(stage.count)}</div>
                {i > 0 && stages[0].count > 0 && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {num((stage.count / stages[0].count) * 100, 1)}% dos captados
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
