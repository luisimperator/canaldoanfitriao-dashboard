import { getDashboardData } from "@/lib/data";
import {
  capacityAnalysis,
  funnelStages,
  inRange,
  isoToday,
  monthKey,
  mqlPerSeller,
  paidSales,
  sum,
} from "@/lib/metrics";
import { brl, num } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { PainelMqlOrigem } from "@/components/PainelMqlOrigem";
import { agruparPorTags } from "@/lib/tag-groups";
import { classifyChannel } from "@/lib/channels";
import { hasUtm } from "@/lib/origin";
import { DateRangePicker } from "@/components/DateRangePicker";
import Link from "next/link";

export const dynamic = "force-dynamic";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const reYMD = /^\d{4}-\d{2}-\d{2}$/;

function ultimoDiaDoMes(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(ate) - Date.parse(de)) / 86400000) + 1;
}

export default async function VisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const data = await getDashboardData();
  const today = isoToday();
  const month = monthKey(today);

  // Período dos cards (?from&to do seletor). Padrão: este mês até hoje. Os
  // cards de "hoje", MQL por vendedor e capacidade do time não seguem o
  // período: são retrato do momento.
  const sp = await searchParams;
  const inicioMes = `${month}-01`;
  const temPeriodo = Boolean(sp.from && sp.to && reYMD.test(sp.from) && reYMD.test(sp.to) && sp.from <= sp.to);
  const de = temPeriodo ? sp.from! : inicioMes;
  const ate = temPeriodo ? sp.to! : today;
  const ateEfetivo = ate < today ? ate : today;
  const diasPeriodo = Math.max(1, diasEntre(de, ateEfetivo));
  const [py, pm] = month.split("-").map(Number);
  const mesPassado = new Date(Date.UTC(py, pm - 2, 1)).toISOString().slice(0, 7);
  const ehMesAtual = de === inicioMes && ate >= today && ate <= ultimoDiaDoMes(month);
  const ehMesInteiro = de.endsWith("-01") && ate === ultimoDiaDoMes(de.slice(0, 7));
  const ehMesPassado = de === `${mesPassado}-01` && ate === ultimoDiaDoMes(mesPassado);
  // "no mês", "em out/26", "em 15/10" ou "no período" — vai no rótulo dos cards.
  const sufixo = ehMesAtual
    ? "no mês"
    : ehMesInteiro
      ? `em ${MESES[Number(de.slice(5, 7)) - 1]}/${de.slice(2, 4)}`
      : de === ate
        ? `em ${de.slice(8, 10)}/${de.slice(5, 7)}`
        : "no período";
  const noPeriodo = <T,>(items: T[], getDate: (t: T) => string) => inRange(items, getDate, de, ate);

  const sales = paidSales(data.sales);
  const salesToday = sales.filter((s) => s.saleDate === today);
  const revenueToday = sum(salesToday.map((s) => s.amount));
  const salesP = noPeriodo(sales, (s) => s.saleDate);
  const revenueP = sum(salesP.map((s) => s.amount));
  // Projeção do mês pelo ritmo atual (run rate) — só quando o período é o mês corrente.
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = Number(ultimoDiaDoMes(month).slice(8, 10));
  const projectedMonth =
    dayOfMonth > 0 ? Math.round((revenueP / dayOfMonth) * daysInMonth) : revenueP;

  const leadsToday = data.leads.filter((l) => l.createdAt === today).length;
  const leadsP = noPeriodo(data.leads, (l) => l.createdAt);

  const cap = capacityAnalysis(data);
  const spendP = sum(noPeriodo(data.adSpend, (a) => a.date).map((a) => a.amount));
  const cac = salesP.length > 0 && spendP > 0 ? spendP / salesP.length : null;
  const leadsPorVenda = salesP.length > 0 ? leadsP.length / salesP.length : null;

  const stages = funnelStages(leadsP);

  // MQL = contato que recebeu tag de qualificação (mql_at), contado no dia em
  // que a tag chegou — a mesma regra do gráfico e do gargalo. Não conta por
  // vendedor: muita gente ganha vendedor sem tag (lista de espera, broadcast,
  // muito-frio). Quem tem tag e ficou sem vendedor vira alerta no card.
  const mqlsP = data.leads.filter((l) => l.mqlAt && l.mqlAt >= de && l.mqlAt <= ate);
  const mqlSemVendedor = mqlsP.filter((l) => !l.sellerId).length;
  const taxaMqlP = leadsP.length > 0 ? (mqlsP.length / leadsP.length) * 100 : null;
  const mqlPerDay = mqlsP.length / diasPeriodo;
  const mqlCap = mqlPerSeller(data, 90, today);
  // MQLs (dia em que a tag de qualificação chegou) e leads (dia em que entraram)
  // por dia, agrupados pelo conjunto de tags: o gráfico troca MQLs ↔ Leads e
  // tira tags no cliente.
  const porTags = agruparPorTags(data.leads);
  // Faturamento gerado pelo time (vendas pagas com vendedor), por dia — a
  // sobreposição opcional do gráfico de MQLs.
  const fatTimePorDia: Record<string, number> = {};
  for (const s of sales) {
    if (s.sellerId) fatTimePorDia[s.saleDate] = (fatTimePorDia[s.saleDate] ?? 0) + s.amount;
  }

  // Leads criados por dia, por canal (UTM) — a origem dos leads segue a janela
  // escolhida no gráfico de MQLs, então vai tudo por dia e o recorte é no cliente.
  const origemPorDia: Record<string, Record<string, number>> = {};
  const rastreadosPorDia: Record<string, number> = {};
  for (const l of data.leads) {
    if (!l.createdAt) continue;
    const ch = classifyChannel(l.utm);
    const dia = (origemPorDia[l.createdAt] ??= {});
    dia[ch] = (dia[ch] ?? 0) + 1;
    if (hasUtm(l)) rastreadosPorDia[l.createdAt] = (rastreadosPorDia[l.createdAt] ?? 0) + 1;
  }

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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-zinc-400">Período</span>
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] p-0.5">
            {[
              { label: "Este mês", href: "/", ativo: !temPeriodo || ehMesAtual },
              {
                label: "Mês passado",
                href: `/?from=${mesPassado}-01&to=${ultimoDiaDoMes(mesPassado)}`,
                ativo: ehMesPassado,
              },
            ].map((o) => (
              <Link
                key={o.label}
                href={o.href}
                scroll={false}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  o.ativo
                    ? "bg-slate-900 dark:bg-violet-600 text-white"
                    : "text-slate-500 dark:text-zinc-400 hover:text-slate-800"
                }`}
              >
                {o.label}
              </Link>
            ))}
          </div>
        </div>
        <DateRangePicker placeholder="Este mês" minYear={2024} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          label="Faturamento hoje"
          value={brl(revenueToday)}
          tone="good"
          hint={`${num(salesToday.length)} venda${salesToday.length === 1 ? "" : "s"}`}
        />
        <KpiCard
          label={`Faturamento ${sufixo}`}
          value={brl(revenueP)}
          tone="good"
          hint={`${num(salesP.length)} venda${salesP.length === 1 ? "" : "s"}${
            ehMesAtual ? ` · projeção ${brl(projectedMonth)}` : ""
          }`}
        />
        <KpiCard label="Leads hoje" value={num(leadsToday)} />
        <KpiCard label={`Leads ${sufixo}`} value={num(leadsP.length)} />
        <KpiCard
          label={`MQL ${sufixo}`}
          value={num(mqlsP.length)}
          hint={
            mqlSemVendedor > 0
              ? `⚠ ${num(mqlSemVendedor)} sem vendedor`
              : taxaMqlP !== null
                ? `${num(taxaMqlP, 1)}% dos leads viram MQL`
                : "recebeu tag de qualificação"
          }
          tone={mqlSemVendedor > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label={`MQL/dia ${sufixo}`}
          value={num(mqlPerDay, 1)}
          hint={`${num(mqlsP.length)} MQL em ${num(diasPeriodo)} dia${diasPeriodo === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="MQL por vendedor"
          value={`~${num(mqlCap.avgPerMonth)}/mês`}
          hint="média histórica (90d)"
        />
        <KpiCard
          label={`Leads por venda ${sufixo}`}
          value={leadsPorVenda ? num(leadsPorVenda, 1) : "—"}
          hint={`${num(leadsP.length)} leads · ${num(salesP.length)} vendas`}
        />
        <KpiCard
          label={`Custo por venda ${sufixo}`}
          value={cac ? brl(cac) : "—"}
          hint={`${brl(spendP)} em tráfego`}
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

      <PainelMqlOrigem
        hoje={today}
        porTags={porTags}
        faturamentoPorDia={fatTimePorDia}
        origemPorDia={origemPorDia}
        rastreadosPorDia={rastreadosPorDia}
        legendaMql={
          <p key="legenda-mql" className="text-xs text-slate-400 dark:text-zinc-500 mt-2">
            MQL = contato que respondeu a pesquisa e recebeu tag de qualificação (lead-a5e,
            lead-gigantes, lead-quente, lead-muito-quente ou lead-frio — muito-frio fica fora), contado
            no dia em que a tag chegou. Cada vendedor processa ~{num(mqlCap.avgPerMonth)} MQL/mês
            (média dos últimos 90 dias).
          </p>
        }
        funil={
          <Card key="funil" title={`Funil ${sufixo}`} className="lg:col-span-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
              {stages.map((stage, i) => (
                <div key={stage.label} className="rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 p-4">
                  <div className="text-xs text-slate-500 dark:text-zinc-400">{stage.label}</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-zinc-100 mt-1">{num(stage.count)}</div>
                  {i > 0 && stages[0].count > 0 && (
                    <div className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                      {num((stage.count / stages[0].count) * 100, 1)}% dos captados
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        }
      />
    </div>
  );
}
