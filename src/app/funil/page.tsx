import { getDashboardData } from "@/lib/data";
import {
  dailyLeadSeries,
  daysAgo,
  funnelStages,
  inRange,
  isoToday,
  monthKey,
} from "@/lib/metrics";
import { num } from "@/lib/format";
import { leadSalesTeamBucket } from "@/lib/leads";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { LeadsTrendChart, SourcePie } from "@/components/charts";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  organico: "Orgânico",
  outro: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  frio: "Frio",
  lista_espera: "Lista de espera",
  quente: "Quente (com vendedor)",
  convertido: "Convertido",
  perdido: "Perdido",
};

export default async function FunilPage() {
  const data = await getDashboardData();
  const today = isoToday();
  const month = monthKey(today);
  const start30 = daysAgo(29);

  const prevDate = new Date(today);
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = monthKey(prevDate.toISOString().slice(0, 10));

  const leadsMonth = data.leads.filter((l) => monthKey(l.createdAt) === month).length;
  const leadsPrevMonth = data.leads.filter((l) => monthKey(l.createdAt) === prevMonth).length;
  const dayOfMonth = Number(today.slice(8, 10));
  const paceMonth = leadsMonth / dayOfMonth;

  const series = dailyLeadSeries(data.leads, 90);
  const media7 = series[series.length - 1]?.media7d ?? null;

  const leads30 = inRange(data.leads, (l) => l.createdAt, start30, today);
  const stages = funnelStages(leads30);

  const bySource = Object.entries(
    leads30.reduce<Record<string, number>>((acc, l) => {
      acc[l.source] = (acc[l.source] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([source, value]) => ({ name: SOURCE_LABELS[source] ?? source, value }));

  const byStatus = Object.entries(
    leads30.reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    }, {})
  ).sort(([, a], [, b]) => b - a);

  const variation =
    leadsPrevMonth > 0 ? ((leadsMonth - leadsPrevMonth) / leadsPrevMonth) * 100 : null;

  // Lista de espera do time de vendas: contatos que o Mailchimp marcou com
  // tag de atendimento ativo (status lista_espera), agrupados pelo motivo
  // (balde da tag). É o backlog que o time precisa puxar — por isso usa todos
  // os contatos, não só a janela de 30 dias.
  const waitingList = data.leads.filter((l) => l.status === "lista_espera");
  const byWaitingBucket = Object.entries(
    waitingList.reduce<Record<string, number>>((acc, l) => {
      const label = leadSalesTeamBucket(l.extra)?.label ?? "Sem tag";
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    }, {})
  ).sort(([, a], [, b]) => b - a);
  const waitingTotal = waitingList.length;

  // Posição ATUAL de todos os contatos nas etapas do CRM (Unnichat)
  const byPipelineStage = Object.entries(
    data.leads.reduce<Record<string, number>>((acc, l) => {
      if (!l.pipelineStage) return acc;
      acc[l.pipelineStage] = (acc[l.pipelineStage] ?? 0) + 1;
      return acc;
    }, {})
  ).sort(([, a], [, b]) => b - a);
  const pipelineTotal = byPipelineStage.reduce((acc, [, n]) => acc + n, 0);

  return (
    <div>
      <PageHeader
        title="Funil de vendas"
        subtitle="Da captação (Meta/Google Ads → Mailchimp/Unnichat) até a venda na Eduzz"
      />
      <DemoBanner show={data.isDemo} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard label="Leads no mês" value={num(leadsMonth)} />
        <KpiCard
          label="Mês anterior (total)"
          value={num(leadsPrevMonth)}
          hint={
            variation !== null
              ? `${variation >= 0 ? "+" : ""}${num(variation, 1)}% vs. mês atual`
              : undefined
          }
          tone={variation !== null && variation < -10 ? "warn" : "neutral"}
        />
        <KpiCard label="Ritmo atual" value={`${num(paceMonth, 1)}/dia`} hint="média do mês" />
        <KpiCard
          label="Média 7 dias"
          value={media7 !== null ? `${num(media7, 1)}/dia` : "—"}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Leads por dia (últimos 90 dias)" className="lg:col-span-3">
          <LeadsTrendChart data={series} />
        </Card>

        <Card title="Etapas do funil (30 dias)" className="lg:col-span-2">
          <div className="space-y-3">
            {stages.map((stage) => {
              const pct = stages[0].count > 0 ? (stage.count / stages[0].count) * 100 : 0;
              return (
                <div key={stage.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700">{stage.label}</span>
                    <span className="font-semibold text-slate-900">
                      {num(stage.count)}{" "}
                      <span className="text-slate-400 font-normal">({num(pct, 1)}%)</span>
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rose-600"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Situação atual dos leads (30 dias)
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {byStatus.map(([status, count]) => (
                  <tr key={status} className="border-b border-slate-50 last:border-0">
                    <td className="py-1.5 text-slate-600">{STATUS_LABELS[status] ?? status}</td>
                    <td className="py-1.5 text-right font-medium text-slate-900">{num(count)}</td>
                    <td className="py-1.5 text-right text-slate-400 w-16">
                      {num((count / leads30.length) * 100, 1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Origem dos leads (30 dias)">
          <SourcePie data={bySource} />
        </Card>

        {waitingTotal > 0 && (
          <Card
            title="Lista de espera do time de vendas (por tag)"
            className="lg:col-span-3"
          >
            <p className="text-xs text-slate-500 mb-3">
              {num(waitingTotal)} contatos marcados no Mailchimp para atendimento
              ativo, separados da base fria/newsletter.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
              {byWaitingBucket.map(([label, count]) => (
                <div
                  key={label}
                  className="rounded-lg bg-amber-50 border border-amber-200 p-4"
                >
                  <div className="text-xs text-amber-700">{label}</div>
                  <div className="text-xl font-bold tabular-nums text-slate-900 mt-1">
                    {num(count)}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {num((count / waitingTotal) * 100, 1)}% da lista
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {byPipelineStage.length > 0 && (
          <Card title="Etapas do CRM (Unnichat) — posição atual" className="lg:col-span-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
              {byPipelineStage.map(([stage, count]) => (
                <div
                  key={stage}
                  className="rounded-lg bg-slate-50 border border-slate-200 p-4"
                >
                  <div className="text-xs text-slate-500">{stage}</div>
                  <div className="text-xl font-bold tabular-nums text-slate-900 mt-1">
                    {num(count)}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {num((count / pipelineTotal) * 100, 1)}% dos contatos
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
