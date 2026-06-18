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
import { DateRangePicker } from "@/components/DateRangePicker";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

interface CohortRow {
  semana: string;
  entraram: number;
  quentes: number;
  converteram: number;
}

interface SurveyWeek {
  semana: string;
  entraram: number;
  responderam: number;
}

interface SurveyDist {
  campo: string;
  valor: string;
  n: number;
}

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

// Gradiente roxo → rosa para o funil (do topo, largo, ao fundo, estreito).
const FUNNEL_COLORS = ["#6d28d9", "#7c3aed", "#a21caf", "#c026d3", "#db2777", "#e11d48"];

export default async function FunilPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const reYMD = /^\d{4}-\d{2}(-\d{2})?$/;
  const cFrom = sp.from && reYMD.test(sp.from) ? sp.from : null;
  const cTo = sp.to && reYMD.test(sp.to) ? sp.to : null;
  const admin = getSupabaseAdmin();
  const cohortAll: CohortRow[] = admin
    ? (((await admin.rpc("weekly_funnel_cohort")).data ?? []) as CohortRow[])
    : [];
  const cohort = cohortAll.filter(
    (r) =>
      (!cFrom || r.semana.slice(0, cFrom.length) >= cFrom) &&
      (!cTo || r.semana.slice(0, cTo.length) <= cTo)
  );

  const surveyWeeklyAll: SurveyWeek[] = admin
    ? (((await admin.rpc("survey_weekly")).data ?? []) as SurveyWeek[])
    : [];
  const surveyWeekly = surveyWeeklyAll.filter(
    (r) =>
      (!cFrom || r.semana.slice(0, cFrom.length) >= cFrom) &&
      (!cTo || r.semana.slice(0, cTo.length) <= cTo)
  );
  const surveyDist: SurveyDist[] = admin
    ? (((await admin.rpc("survey_profile_dist")).data ?? []) as SurveyDist[])
    : [];
  const distGroup = (campo: string) => {
    const rows = surveyDist.filter((d) => d.campo === campo);
    const total = rows.reduce((a, b) => a + b.n, 0);
    return { rows: rows.sort((a, b) => b.n - a.n), total };
  };
  const distFat = distGroup("faturamento");
  const distImoveis = distGroup("imoveis");
  const surveyTotal = distFat.total;

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

      <Card title="Funil semanal: entraram → quentes → A5E/Gigantes" className="mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-xs text-slate-500">Período</span>
          <DateRangePicker minYear={2026} />
        </div>
        {cohort.length === 0 ? (
          <p className="text-sm text-slate-400">
            Coletando. Conforme os leads entram pelo Unnichat, viram quentes e compram A5E/Gigantes,
            esta coorte semanal preenche — aí dá pra ver a conversão real de cada semana.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 font-medium">Semana</th>
                  <th className="py-2 font-medium text-right">Entraram</th>
                  <th className="py-2 font-medium text-right">Viraram quentes</th>
                  <th className="py-2 font-medium text-right">Compraram A5E/Gigantes</th>
                  <th className="py-2 font-medium text-right">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {cohort.map((r) => (
                  <tr key={r.semana} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 text-slate-600 tabular-nums">
                      {new Date(r.semana + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-700 font-medium">{num(r.entraram)}</td>
                    <td className="py-1.5 text-right tabular-nums text-rose-600">{num(r.quentes)}</td>
                    <td className="py-1.5 text-right tabular-nums text-emerald-600 font-semibold">{num(r.converteram)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                      {r.entraram > 0 ? `${num((r.converteram / r.entraram) * 100, 1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Coorte por semana de ENTRADA do lead no Unnichat: quantos entraram, quantos viraram
          quentes, e quantos compraram Anfitrião 5 Estrelas ou Gigantes (cruzado por e-mail com a
          Eduzz). Preenche conforme os dados entram.
        </p>
      </Card>

      <Card title="Pesquisa de qualificação (Unnichat) — quem respondeu e perfil" className="mb-4">
        <p className="text-xs text-slate-500 mb-3">
          Pesquisa disparada para os leads novos no WhatsApp (faturamento, nº de imóveis, tipo de
          operação). <strong>{num(surveyTotal)}</strong> contatos responderam até agora.
        </p>

        {surveyWeekly.length > 0 && (
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 font-medium">Semana</th>
                  <th className="py-2 font-medium text-right">Entraram</th>
                  <th className="py-2 font-medium text-right">Responderam</th>
                  <th className="py-2 font-medium text-right">Taxa de resposta</th>
                </tr>
              </thead>
              <tbody>
                {surveyWeekly.map((r) => (
                  <tr key={r.semana} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 text-slate-600 tabular-nums">
                      {new Date(r.semana + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-700 font-medium">{num(r.entraram)}</td>
                    <td className="py-1.5 text-right tabular-nums text-teal-600">{num(r.responderam)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                      {r.entraram > 0 ? `${num((r.responderam / r.entraram) * 100, 1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Faturamento dos respondentes
            </h3>
            <div className="space-y-2">
              {distFat.rows.map((d) => {
                const pct = distFat.total > 0 ? (d.n / distFat.total) * 100 : 0;
                return (
                  <div key={d.valor}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-slate-600">{d.valor}</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {num(d.n)} <span className="text-slate-400 font-normal">({num(pct, 0)}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Nº de imóveis dos respondentes
            </h3>
            <div className="space-y-2">
              {distImoveis.rows.map((d) => {
                const pct = distImoveis.total > 0 ? (d.n / distImoveis.total) * 100 : 0;
                return (
                  <div key={d.valor}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-slate-600">{d.valor}</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {num(d.n)} <span className="text-slate-400 font-normal">({num(pct, 0)}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          A tabela semanal respeita o período selecionado acima. As barras de perfil são sobre todos
          os {num(surveyTotal)} respondentes (a pesquisa só captura leads novos, então cobre quem
          entrou após ela ir ao ar, ~abril/2026).
        </p>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Leads por dia (últimos 90 dias)" className="lg:col-span-3">
          <LeadsTrendChart data={series} />
        </Card>

        <Card title="Etapas do funil (30 dias)" className="lg:col-span-2">
          <div className="py-2">
            {stages.map((stage, i) => {
              const pct = stages[0].count > 0 ? (stage.count / stages[0].count) * 100 : 0;
              return (
                <div key={stage.label} className="flex flex-col items-center">
                  <div
                    className="flex items-center justify-between gap-3 rounded-md px-4 py-2.5 text-white shadow-sm"
                    style={{
                      width: `${Math.max(18, pct)}%`,
                      minWidth: "150px",
                      backgroundColor: FUNNEL_COLORS[Math.min(i, FUNNEL_COLORS.length - 1)],
                    }}
                  >
                    <span className="text-sm font-medium truncate">{stage.label}</span>
                    <span className="text-sm font-bold tabular-nums whitespace-nowrap">
                      {num(stage.count)} · {num(pct, 0)}%
                    </span>
                  </div>
                  {i < stages.length - 1 && (
                    <div className="text-slate-300 leading-none my-1 text-xs">▼</div>
                  )}
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
