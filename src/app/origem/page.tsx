import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { paidSales, monthKey } from "@/lib/metrics";
import { brl, num } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { classifyChannel, CHANNEL_COLOR, type Channel } from "@/lib/channels";

export const dynamic = "force-dynamic";

export default async function OrigemPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>;
}) {
  const data = await getDashboardData();
  const sales = paidSales(data.sales);

  const anos = [...new Set(sales.map((s) => s.saleDate.slice(0, 4)))].sort().reverse();
  const { ano } = await searchParams;
  const anoSel = ano && anos.includes(ano) ? ano : "todos";
  const filtered =
    anoSel === "todos" ? sales : sales.filter((s) => s.saleDate.slice(0, 4) === anoSel);

  // Agrupa por canal
  const byChannel = new Map<Channel, { revenue: number; count: number }>();
  for (const s of filtered) {
    const ch = classifyChannel(s.utm);
    const e = byChannel.get(ch) ?? { revenue: 0, count: 0 };
    e.revenue += s.amount;
    e.count += 1;
    byChannel.set(ch, e);
  }
  const rows = [...byChannel.entries()]
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue));
  const semRastreio = byChannel.get("Sem rastreio")?.revenue ?? 0;
  const pctRastreado =
    totalRevenue > 0 ? ((totalRevenue - semRastreio) / totalRevenue) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Origem das vendas"
        subtitle="De onde vem o faturamento, segundo as UTMs registradas em cada venda"
      />
      <DemoBanner show={data.isDemo} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link
          href="/origem"
          className={`rounded-full px-3 py-1.5 text-sm ${
            anoSel === "todos"
              ? "bg-rose-600 text-white font-semibold"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Todo o período
        </Link>
        {anos.map((a) => (
          <Link
            key={a}
            href={`/origem?ano=${a}`}
            className={`rounded-full px-3 py-1.5 text-sm ${
              anoSel === a
                ? "bg-rose-600 text-white font-semibold"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {a}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <KpiCard label="Faturamento no período" value={brl(totalRevenue)} tone="good" />
        <KpiCard label="Vendas no período" value={num(filtered.length)} />
        <KpiCard
          label="Faturamento rastreado"
          value={`${num(pctRastreado, 0)}%`}
          hint="com UTM de origem"
        />
      </div>

      <Card title="Faturamento por canal">
        <div className="space-y-3">
          {rows.map((r) => {
            const pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
            return (
              <div key={r.channel}>
                <div className="flex justify-between items-baseline text-sm mb-1">
                  <span className="flex items-center gap-2 text-slate-700">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: CHANNEL_COLOR[r.channel] }}
                    />
                    {r.channel}
                  </span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {brl(r.revenue)}{" "}
                    <span className="text-slate-400 font-normal">
                      ({num(pct, 1)}% · {num(r.count)} vendas)
                    </span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(1, (r.revenue / maxRevenue) * 100)}%`,
                      background: CHANNEL_COLOR[r.channel],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <p className="mt-6 text-xs text-slate-400">
        Como é calculado: cada venda é classificada pela UTM gravada no checkout
        da Eduzz. “Tráfego pago (Meta)” reúne campanhas com sinal de anúncio no
        medium (fb_, advantage, lookalike, launch…); “Vendedores” são os links
        individuais (Diego, Flávio, Antonio); “Instagram orgânico” inclui o perfil
        do Rômulo. “Sem rastreio” são vendas sem nenhuma UTM — base quente, link
        direto, indicação. É uma aproximação a partir do que foi marcado na origem.
      </p>
    </div>
  );
}
