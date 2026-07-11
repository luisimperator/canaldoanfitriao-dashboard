import { getDashboardData } from "@/lib/data";
import { monthlyAdEfficiency } from "@/lib/cac";
import { sum } from "@/lib/metrics";
import { brl, num, monthLabel } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { CacRoasChart } from "@/components/charts";
import { DateRangePicker } from "@/components/DateRangePicker";

export const dynamic = "force-dynamic";

function shiftYM(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function CacPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const data = await getDashboardData();
  const allRows = monthlyAdEfficiency(data);
  const re = /^\d{4}-\d{2}(-\d{2})?$/;
  const months = allRows.map((r) => r.month);
  const lastM = months.length ? months[months.length - 1] : new Date().toISOString().slice(0, 7);
  const to = (sp.to && re.test(sp.to) ? sp.to : lastM).slice(0, 7);
  const from = (sp.from && re.test(sp.from) ? sp.from : shiftYM(to, -11)).slice(0, 7);
  const rows = allRows.filter((r) => r.month >= from && r.month <= to);

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
        <span className="text-xs text-slate-500 dark:text-zinc-400">Período</span>
        <DateRangePicker />
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
        <p className="mt-2 text-xs text-slate-400 dark:text-zinc-500">
          ROAS e CAC são <strong>blended</strong>: usam o faturamento total (inclui
          orgânico e recompra), não só o que é atribuído ao anúncio. Servem pra
          decidir o nível de investimento, não pra atribuição por clique.
        </p>
        {rows.some((r) => r.spendIncomplete) && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            ⚠️ Meses marcados com ⚠️ têm dias de investimento sem registro (sync de
            anúncios fora do ar no período) — o CAC real é maior e o ROAS menor do
            que o mostrado.
          </p>
        )}
      </Card>

      <Card title="Mês a mês">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-white/[0.06]">
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
                <tr key={r.month} className="border-b border-slate-50 dark:border-white/[0.04] last:border-0">
                  <td className="py-1.5 text-slate-700 dark:text-zinc-300">
                    {monthLabel(r.month)}
                    {r.spendIncomplete && (
                      <span
                        title={`Só ${r.spendDays} dia(s) do mês têm gasto registrado — investimento subestimado`}
                        className="ml-1"
                      >
                        ⚠️
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">
                    {r.spend > 0 ? brl(r.spend) : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-900 dark:text-zinc-100 font-medium">
                    {r.revenue > 0 ? brl(r.revenue) : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">{num(r.sales)}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">
                    {r.cac !== null ? brl(r.cac) : "—"}
                  </td>
                  <td
                    className={`py-1.5 text-right tabular-nums font-semibold ${
                      r.roas === null
                        ? "text-slate-300 dark:text-zinc-600"
                        : r.roas >= 3
                          ? "text-emerald-600 dark:text-emerald-400"
                          : r.roas >= 1
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-rose-600 dark:text-rose-400"
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
