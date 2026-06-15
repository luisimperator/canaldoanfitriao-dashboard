import { getDashboardData } from "@/lib/data";
import { monthlyAdEfficiency, lastMonths } from "@/lib/cac";
import { sum } from "@/lib/metrics";
import { brl, num, monthLabel } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { CacRoasChart } from "@/components/charts";
import { PeriodSelect } from "@/components/PeriodSelect";

export const dynamic = "force-dynamic";

const OPTIONS = [
  { value: "6", label: "6 m" },
  { value: "12", label: "12 m" },
  { value: "24", label: "24 m" },
  { value: "all", label: "Tudo" },
];

export default async function CacPage({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>;
}) {
  const sp = await searchParams;
  const sel = sp.meses && OPTIONS.some((o) => o.value === sp.meses) ? sp.meses : "12";
  const n = sel === "all" ? null : Number(sel);

  const data = await getDashboardData();
  const rows = lastMonths(monthlyAdEfficiency(data), n);

  const totSpend = sum(rows.map((r) => r.spend));
  const totRev = sum(rows.map((r) => r.revenue));
  const totSales = sum(rows.map((r) => r.sales));
  const roas = totSpend > 0 ? totRev / totSpend : null;
  const cac = totSales > 0 ? totSpend / totSales : null;

  const chart = rows.map((r) => ({
    month: monthLabel(r.month),
    investimento: Math.round(r.spend),
    faturamento: Math.round(r.revenue),
    roas: r.roas,
  }));

  return (
    <div>
      <PageHeader
        title="CAC / ROAS"
        subtitle="Investimento em tráfego (Meta + Google) vs faturamento e vendas (Eduzz), mês a mês"
      />
      <DemoBanner show={data.isDemo} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Janela</span>
        <PeriodSelect options={OPTIONS} current={sel} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard label="Investimento (período)" value={brl(totSpend)} />
        <KpiCard label="Faturamento (período)" value={brl(totRev)} />
        <KpiCard
          label="ROAS (blended)"
          value={roas !== null ? `${num(roas, 1)}x` : "—"}
          hint="faturamento ÷ investimento"
          tone={roas !== null && roas >= 3 ? "good" : "neutral"}
        />
        <KpiCard
          label="CAC (custo por venda)"
          value={cac !== null ? brl(cac) : "—"}
          hint={`${num(totSales)} vendas`}
        />
      </div>

      <Card title="Investimento × faturamento × ROAS" className="mb-4">
        <CacRoasChart data={chart} />
        <p className="mt-2 text-xs text-slate-400">
          ROAS e CAC são <strong>blended</strong>: usam o faturamento total (inclui
          orgânico e recompra), não só o que é atribuído ao anúncio. Servem pra
          decidir o nível de investimento, não pra atribuição por clique.
        </p>
      </Card>

      <Card title="Mês a mês">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="py-2 font-medium">Mês</th>
                <th className="py-2 font-medium text-right">Investimento</th>
                <th className="py-2 font-medium text-right">Faturamento</th>
                <th className="py-2 font-medium text-right">Vendas</th>
                <th className="py-2 font-medium text-right">CAC</th>
                <th className="py-2 font-medium text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.month} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5 text-slate-700">{monthLabel(r.month)}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600">
                    {r.spend > 0 ? brl(r.spend) : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-900 font-medium">
                    {r.revenue > 0 ? brl(r.revenue) : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600">{num(r.sales)}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600">
                    {r.cac !== null ? brl(r.cac) : "—"}
                  </td>
                  <td
                    className={`py-1.5 text-right tabular-nums font-semibold ${
                      r.roas === null
                        ? "text-slate-300"
                        : r.roas >= 3
                          ? "text-emerald-600"
                          : r.roas >= 1
                            ? "text-amber-600"
                            : "text-rose-600"
                    }`}
                  >
                    {r.roas !== null ? `${num(r.roas, 1)}x` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
