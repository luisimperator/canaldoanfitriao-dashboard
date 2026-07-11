import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { brl, num, monthLabel } from "@/lib/format";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import { BarsChart } from "@/components/charts";
import { DateRangePicker } from "@/components/DateRangePicker";

export const dynamic = "force-dynamic";

interface LtvData {
  as_of: string;
  overall: {
    customers: number;
    revenue: number;
    orders: number;
    ltv_mean: number;
    ltv_median: number;
    aov: number;
    repeat_customers: number;
    repeat_rate: number;
    pct_rev_repeat: number;
  };
  dist: { n: string; c: number }[];
  cohorts: { month: string; customers: number; ltv: number }[];
  entry_products: { product: string; customers: number; ltv: number }[];
}

async function getLtv(): Promise<{ ltv: LtvData; updatedAt: string } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("analytics_snapshot")
    .select("data, updated_at")
    .eq("key", "ltv")
    .maybeSingle();
  if (!data) return null;
  return { ltv: data.data as LtvData, updatedAt: data.updated_at as string };
}

export default async function LtvPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const snap = await getLtv();

  if (!snap) {
    return (
      <div>
        <PageHeader title="LTV & recompra" subtitle="Valor do cliente ao longo do tempo" />
        <Card>
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Sem snapshot de LTV ainda. Ele é gerado a partir de um export de vendas
            da Eduzz com e-mail/CPF do comprador.
          </p>
        </Card>
      </div>
    );
  }

  const { ltv, updatedAt } = snap;
  const o = ltv.overall;
  const distData = ltv.dist.map((d) => ({ n: `${d.n}x`, clientes: d.c }));
  const cohMonths = ltv.cohorts.map((c) => c.month);
  const re = /^\d{4}-\d{2}(-\d{2})?$/;
  const cohMin = cohMonths[0] ?? "2024-01";
  const cohMax = cohMonths[cohMonths.length - 1] ?? cohMin;
  const cohTo = (sp.to && re.test(sp.to) ? sp.to : cohMax).slice(0, 7);
  const cohFrom = (sp.from && re.test(sp.from) ? sp.from : cohMin).slice(0, 7);
  const cohortData = ltv.cohorts
    .filter((c) => c.month >= cohFrom && c.month <= cohTo)
    .map((c) => ({ mes: monthLabel(c.month), ltv: c.ltv }));

  return (
    <div>
      <PageHeader
        title="LTV & recompra"
        subtitle="Quanto cada cliente vale ao longo do tempo (base Eduzz, por e-mail/CPF)"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard label="LTV médio" value={brl(o.ltv_mean)} hint={`${num(o.customers)} clientes`} />
        <KpiCard
          label="Recompram (≥2)"
          value={`${num(o.repeat_rate, 1)}%`}
          hint={`${num(o.repeat_customers)} clientes`}
          tone="good"
        />
        <KpiCard
          label="Faturamento de recompra"
          value={`${num(o.pct_rev_repeat, 1)}%`}
          hint="do total"
          tone="good"
        />
        <KpiCard label="Ticket médio (AOV)" value={brl(o.aov)} hint={`${num(o.orders)} pedidos`} />
      </div>

      <Card title="O ponto-chave" className="mb-4">
        <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
          <strong className="text-teal-600">{num(o.repeat_rate, 1)}%</strong> dos clientes
          recompram, mas eles geram{" "}
          <strong className="text-rose-600 dark:text-rose-400">{num(o.pct_rev_repeat, 1)}%</strong> do faturamento.
          O LTV mediano é só {brl(o.ltv_median)} (a maioria compra um produto barato uma vez) —
          o dinheiro está na cauda que recompra. A alavanca de crescimento não é só captar,
          é <strong>fazer recomprar</strong>.
        </p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title="Quantas vezes cada cliente compra">
          <BarsChart data={distData} xKey="n" barKey="clientes" name="Clientes" color="#38bdf8" />
        </Card>
        <Card title="LTV por mês de aquisição (coorte)">
          <div className="flex justify-end mb-2">
            <DateRangePicker minYear={2024} />
          </div>
          <BarsChart data={cohortData} xKey="mes" barKey="ltv" name="LTV" color="#2dd4bf" money />
        </Card>
      </div>

      <Card title="LTV por produto de entrada (porta de entrada do cliente)">
        <p className="text-xs text-slate-400 dark:text-zinc-500 mb-3">
          Por onde o cliente entrou (primeira compra) e quanto ele vale no total. Quem entra
          por curso de alto valor vale muito mais — pista de onde vale empurrar a porta de entrada.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-white/10">
                <th className="py-2 font-medium">Produto de entrada</th>
                <th className="py-2 font-medium text-right">Clientes</th>
                <th className="py-2 font-medium text-right">LTV médio</th>
              </tr>
            </thead>
            <tbody>
              {ltv.entry_products.map((p) => (
                <tr key={p.product} className="border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                  <td className="py-1.5 text-slate-700 dark:text-zinc-300">{p.product}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">{num(p.customers)}</td>
                  <td
                    className={`py-1.5 text-right tabular-nums font-semibold ${
                      p.ltv >= 1000 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-zinc-300"
                    }`}
                  >
                    {brl(p.ltv)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-4 text-xs text-slate-500 dark:text-zinc-400">
        Snapshot de {new Date(updatedAt).toLocaleDateString("pt-BR")} (export Eduzz até{" "}
        {ltv.as_of}). A partir das vendas novas, o comprador já é gravado automaticamente —
        é só reenviar um export pra atualizar o retroativo.
      </p>
    </div>
  );
}
