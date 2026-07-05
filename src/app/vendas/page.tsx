import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import {
  daysAgo,
  isCourseSale,
  isoToday,
  monthKey,
  paidSales,
  sellerStats,
} from "@/lib/metrics";
import { brl, monthLabel, num } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { SalesBySellerChart, TeamHistoryChart } from "@/components/charts";
import { DateRangePicker } from "@/components/DateRangePicker";
import { getD0ByLoad, getSpeedToLead } from "@/lib/speed";
import { getMqlCohort, getMqlFlow } from "@/lib/mql-flow";
import { getBuyerTempMonth, PERFIL_ORDER, type BuyerTempRow } from "@/lib/buyer-temp";

export const dynamic = "force-dynamic";

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

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
  searchParams: Promise<{ mes?: string; from?: string; to?: string }>;
}) {
  const data = await getDashboardData();
  const today = isoToday();
  const currentMonth = monthKey(today);

  const sp = await searchParams;
  const { mes } = sp;
  const reYM = /^\d{4}-\d{2}(-\d{2})?$/;
  const rangeTo = (sp.to && reYM.test(sp.to) ? sp.to : currentMonth).slice(0, 7);
  const rangeFrom = (sp.from && reYM.test(sp.from) ? sp.from : shiftMonth(rangeTo, -5)).slice(0, 7);

  // PERÍODO dos indicadores do topo (seletor global da página): from/to
  // completos da URL; sem seleção, últimos 30 dias. Aceita YYYY-MM (mês
  // inteiro) ou YYYY-MM-DD. O gráfico mensal usa o mesmo from/to, só que
  // truncado a mês (rangeFrom/rangeTo acima, com padrão próprio de 6 meses).
  const reFullDate = /^\d{4}-\d{2}-\d{2}$/;
  const periodTo =
    sp.to && reYM.test(sp.to)
      ? reFullDate.test(sp.to)
        ? sp.to
        : lastDayOf(sp.to.slice(0, 7))
      : today;
  const periodFrom =
    sp.from && reYM.test(sp.from)
      ? reFullDate.test(sp.from)
        ? sp.from
        : `${sp.from.slice(0, 7)}-01`
      : daysAgo(29, new Date(today));
  const fmtDM = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const periodLabel = `${fmtDM(periodFrom)}–${fmtDM(periodTo)}`;
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

  const [{ rows: speed, total: speedTotal }, mqlFlow, d0Load, cohort, buyerTemp] =
    await Promise.all([
      getSpeedToLead(30),
      getMqlFlow(),
      getD0ByLoad(),
      getMqlCohort(),
      getBuyerTempMonth(`${selectedMonth}-01`, lastDayOf(selectedMonth)),
    ]);

  // Compradores do mês × temperatura: visão geral + por vendedor.
  const perfilTotals = new Map<string, number>();
  const perfilBySeller = new Map<string, Map<string, number>>();
  for (const r of buyerTemp) {
    perfilTotals.set(r.perfil, (perfilTotals.get(r.perfil) ?? 0) + r.compradores);
    if (r.vendedor) {
      const m = perfilBySeller.get(r.vendedor) ?? new Map<string, number>();
      m.set(r.perfil, (m.get(r.perfil) ?? 0) + r.compradores);
      perfilBySeller.set(r.vendedor, m);
    }
  }
  const orderPerfil = (m: Map<string, number>) =>
    PERFIL_ORDER.filter((p) => m.has(p)).map((p) => ({ perfil: p, n: m.get(p)! }));
  const compradoresMes = buyerTemp.reduce((a, r) => a + r.compradores, 0);

  const w7 = mqlFlow?.windows.find((w) => w.days === 7);
  const w30 = mqlFlow?.windows.find((w) => w.days === 30);
  const w90 = mqlFlow?.windows.find((w) => w.days === 90);

  // Indicadores do PERÍODO selecionado no topo: MQLs pela data em que o lead
  // recebeu a tag (mql_at), vendas de curso pela data da venda.
  const mqlPeriod = data.leads.filter(
    (l) => l.mqlAt && l.mqlAt >= periodFrom && l.mqlAt <= periodTo
  ).length;
  const cursoPeriod = paidSales(data.sales).filter(
    (s) => isCourseSale(s) && s.saleDate >= periodFrom && s.saleDate <= periodTo
  );
  const vendasCursoPeriod = cursoPeriod.length;
  const vendasTimePeriod = cursoPeriod.filter((s) => s.sellerId != null).length;

  // Conversão REAL de MQL, por coorte (comprou curso DEPOIS de virar MQL) — a
  // razão vendas÷MQL de fluxos independentes inflava a conversão. Mede o
  // processo de TAG, não o time: a automação taggeia só parte dos atendidos.
  const convCohort =
    cohort && cohort.mqlsTotal > 0 ? cohort.mqlsCompraram / cohort.mqlsTotal : null;

  // Venda DO TIME = tem vendedor atribuído (a UTM diego/flavio do link vira
  // seller_id na venda). É o critério de comissão — independe da tag de MQL.
  const start30 = daysAgo(29, new Date(today));
  const curso30 = paidSales(data.sales).filter(
    (s) => isCourseSale(s) && s.saleDate >= start30 && s.saleDate <= today
  );
  const vendasCurso30 = curso30.length;
  const vendasTime30 = curso30.filter((s) => s.sellerId != null).length;

  // Tem MQL pra mais vendedor? Projeta o fluxo de 30d em MQL/mês e divide
  // pelo tamanho do time simulado — é a conta da comissão.
  const mqlPerMonth = w30 ? Math.round(w30.perDay * 30) : null;

  const activeSellers = data.sellers.filter((s) => s.isActive).length;
  const d0Rate = speedTotal.atribuidos > 0 ? speedTotal.d0 / speedTotal.atribuidos : null;

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
  const months = [...monthsSet].sort().filter((m) => m >= rangeFrom && m <= rangeTo);
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

  // Diagnóstico: capacidade ou processo? Compara o d0 em dias calmos vs pico.
  // Se no pico (todo mundo mobilizado) o d0 é ALTO e no dia calmo é baixo, o
  // gargalo é rotina/processo — contratar não resolve. Só se o d0 despencar no
  // pico é que falta gente.
  const rate = (r?: { d0: number; leads: number }) =>
    r && r.leads > 0 ? r.d0 / r.leads : null;
  const d0Calmo = rate(d0Load.find((r) => r.bucket === "calmo"));
  const d0Pico = rate(d0Load.find((r) => r.bucket === "pico"));
  const processo = d0Calmo !== null && d0Pico !== null && d0Pico - d0Calmo >= 0.1;
  const faltaGente = d0Calmo !== null && d0Pico !== null && d0Calmo - d0Pico >= 0.1;

  const capTone = processo ? "warn" : faltaGente ? "bad" : d0Rate !== null ? "good" : "bad";
  const capHeadline = processo
    ? `🟠 O gargalo é processo, não gente: no pico o time atende ${num((d0Pico ?? 0) * 100, 0)}% no dia 0; no dia calmo, só ${num((d0Calmo ?? 0) * 100, 0)}%`
    : faltaGente
      ? `🔴 No pico o atendimento cai (${num((d0Pico ?? 0) * 100, 0)}% vs ${num((d0Calmo ?? 0) * 100, 0)}% no calmo) — aí sim falta gente`
      : d0Rate !== null
        ? `Atendimento no dia 0: ${num(d0Rate * 100, 0)}% dos leads`
        : "Sem dados de atendimento suficientes para a análise";

  return (
    <div>
      <PageHeader
        title="Vendas & time"
        subtitle="Desempenho por vendedor e análise de capacidade do time"
      />
      <DemoBanner show={data.isDemo} />

      {/* Seletor GLOBAL da página: os cards abaixo e o gráfico mensal seguem
          este período — é aqui que se compara os ratios ao longo do tempo. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Período dos indicadores</span>
        <DateRangePicker placeholder="Últimos 30 dias" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <KpiCard
          label="Conversão real de MQL"
          value={convCohort !== null ? `${num(convCohort * 100, 1)}%` : "—"}
          hint={
            cohort
              ? `${num(cohort.mqlsCompraram)} de ${num(cohort.mqlsTotal)} MQLs compraram curso (todo o histórico)`
              : "coorte: comprou depois de virar MQL"
          }
        />
        <KpiCard
          label={`Vendas do time (${periodLabel})`}
          value={
            vendasCursoPeriod > 0 ? `${num(vendasTimePeriod)} de ${num(vendasCursoPeriod)}` : "—"
          }
          hint={
            vendasCursoPeriod > 0
              ? `${num((vendasTimePeriod / vendasCursoPeriod) * 100, 0)}% das vendas de curso têm vendedor (UTM diego/flavio)`
              : "venda com vendedor atribuído"
          }
          tone="good"
        />
        <KpiCard
          label={`MQL novos (${periodLabel})`}
          value={num(mqlPeriod)}
          hint="pela data em que recebeu a tag de MQL"
        />
        <KpiCard
          label={`Vendas de curso (${periodLabel})`}
          value={num(vendasCursoPeriod)}
          hint="A5E + Gigantes"
        />
      </div>

      {mqlFlow && mqlFlow.windows.length > 0 && (
        <Card title="Fluxo de MQL — tem lead pra mais vendedor?" className="mb-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[w7, w30, w90].map(
              (w) =>
                w && (
                  <div key={w.days} className="rounded-lg bg-slate-50 px-3 py-2.5 text-center">
                    <p className="text-2xl font-bold text-slate-900 tabular-nums">
                      {num(w.perBusinessDay, 1)}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      MQL/dia útil
                      <br />
                      {w.effectiveDays < w.days
                        ? `${w.days}d (só ${w.effectiveDays}d de histórico)`
                        : `últimos ${w.days} dias`}
                    </p>
                  </div>
                )
            )}
          </div>

          {mqlPerMonth !== null && (
            <>
              <p className="text-sm text-slate-700 mb-2">
                No ritmo dos últimos 30 dias, o funil gera{" "}
                <strong>~{num(mqlPerMonth)} MQL/mês</strong>
                {vendasCurso30 > 0 && (
                  <>
                    {" "}
                    e o time fechou <strong>{num(vendasTime30)}</strong> das{" "}
                    {num(vendasCurso30)} vendas de curso (
                    {num((vendasTime30 / vendasCurso30) * 100, 0)}%, pela UTM do vendedor)
                  </>
                )}
                . Dividindo por tamanho de time:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="py-1.5 font-medium">Time</th>
                      <th className="py-1.5 font-medium text-right">MQL/vendedor/mês</th>
                      <th className="py-1.5 font-medium text-right">MQL/vendedor/dia útil</th>
                      {vendasTime30 > 0 && (
                        <th className="py-1.5 font-medium text-right">
                          Vendas do time/vendedor/mês
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {[2, 3, 4].map((team) => {
                      const perSeller = mqlPerMonth / team;
                      const isNow = team === activeSellers;
                      return (
                        <tr
                          key={team}
                          className={`border-t border-slate-100 ${isNow ? "bg-rose-50/50" : ""}`}
                        >
                          <td className="py-1.5 text-slate-700">
                            {team} vendedores{isNow ? " (hoje)" : ""}
                          </td>
                          <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">
                            {num(perSeller, 0)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-slate-700">
                            {num(perSeller / 21, 1)}
                          </td>
                          {vendasTime30 > 0 && (
                            <td className="py-1.5 text-right tabular-nums text-slate-700">
                              ~{num(vendasTime30 / team, 1)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p className="text-xs text-slate-400 mt-3">
            MQL novo = contato na data em que RECEBEU a tag de qualificação (lead-a5e,
            lead-gigantes, lead-quente ou lead-muito-quente; histórico do CRM
            {mqlFlow.historySince
              ? `, registrado desde ${mqlFlow.historySince.slice(8, 10)}/${mqlFlow.historySince.slice(5, 7)}`
              : ""}
            ) — não a data de criação do lead nem a atribuição a vendedor. &quot;Vendas do
            time/vendedor&quot; divide as vendas de curso COM vendedor (a UTM diego/flavio do
            link vira a atribuição) pelo tamanho do time simulado — é a conta da comissão:
            mais vendedores no mesmo volume = fatia menor pra cada um, a menos que o fluxo
            de MQL cresça junto.
          </p>
        </Card>
      )}

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

      <Card title={`Compradores de curso × temperatura — ${monthTitle(selectedMonth)}`} className="mb-4">
        {compradoresMes === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma venda de curso no mês selecionado.</p>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-3">
              <PerfilTable titulo={`Todos (${num(compradoresMes)})`} rows={orderPerfil(perfilTotals)} />
              {[...perfilBySeller.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([nome, m]) => {
                  const tot = [...m.values()].reduce((x, y) => x + y, 0);
                  return (
                    <PerfilTable key={nome} titulo={`${nome} (${num(tot)})`} rows={orderPerfil(m)} />
                  );
                })}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Um comprador por e-mail; temperatura = tag mais alta que o lead já recebeu no CRM.
              &quot;Sem temperatura&quot; = está no CRM mas a automação não qualificou; &quot;fora do
              CRM&quot; = comprou pela base/e-mail (ou com e-mail diferente do WhatsApp).
            </p>
          </>
        )}
      </Card>

      <Card title="Velocidade no atendimento (speed-to-lead) — últimos 30 dias" className="mb-4">
        {speed.length === 0 ? (
          <p className="text-sm text-slate-600">
            Sem dados de conversa ainda (ou a função do banco não foi aplicada — migração
            0005_speed_to_lead).
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
              <KpiCard
                label="Atendidos no dia 0"
                value={`${pct(speedTotal.d0, speedTotal.atribuidos)}%`}
                hint={`${num(speedTotal.d0)} de ${num(speedTotal.atribuidos)} leads`}
                tone={pct(speedTotal.d0, speedTotal.atribuidos) >= 60 ? "good" : "bad"}
              />
              <KpiCard
                label="No dia seguinte (D+1)"
                value={`${pct(speedTotal.d1, speedTotal.atribuidos)}%`}
                hint={`${num(speedTotal.d1)} leads`}
              />
              <KpiCard
                label="D+2 ou mais"
                value={`${pct(speedTotal.d2 + speedTotal.d3plus, speedTotal.atribuidos)}%`}
                hint={`${num(speedTotal.d2 + speedTotal.d3plus)} leads`}
              />
              <KpiCard
                label="Nunca conversados"
                value={`${pct(speedTotal.nunca, speedTotal.atribuidos)}%`}
                hint={`${num(speedTotal.nunca)} leads`}
                tone={speedTotal.nunca > 0 ? "bad" : "good"}
              />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Dia 0</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> D+1</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> D+2</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> D+3 ou mais</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300" /> Não conversado</span>
            </div>

            <div className="space-y-3 mb-2">
              {speed.map((r) => {
                const segs = [
                  { v: r.d0, c: "bg-emerald-500" },
                  { v: r.d1, c: "bg-amber-400" },
                  { v: r.d2, c: "bg-orange-500" },
                  { v: r.d3plus, c: "bg-rose-500" },
                  { v: r.nunca, c: "bg-slate-300" },
                ];
                return (
                  <div key={r.seller}>
                    <div className="flex items-baseline justify-between mb-1 text-sm">
                      <span className="font-medium text-slate-900">{r.seller}</span>
                      <span className="text-slate-500">
                        <span className="font-semibold text-emerald-600">
                          {pct(r.d0, r.atribuidos)}%
                        </span>{" "}
                        no dia 0 · {num(r.atribuidos)} leads
                      </span>
                    </div>
                    <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100">
                      {segs.map((s, i) =>
                        s.v > 0 ? (
                          <div
                            key={i}
                            className={s.c}
                            style={{ width: `${pct(s.v, r.atribuidos)}%` }}
                          />
                        ) : null
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="overflow-x-auto -mx-5 px-5 mt-4">
              <table className="w-full text-sm min-w-[560px] tabular-nums">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="py-2">Vendedor</th>
                    <th className="py-2 text-right">Atribuídos</th>
                    <th className="py-2 text-right">Dia 0</th>
                    <th className="py-2 text-right">D+1</th>
                    <th className="py-2 text-right">D+2</th>
                    <th className="py-2 text-right">D+3+</th>
                    <th className="py-2 text-right">Não conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {speed.map((r) => (
                    <tr key={r.seller} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-medium text-slate-900">{r.seller}</td>
                      <td className="py-2 text-right text-slate-500">{num(r.atribuidos)}</td>
                      <td className="py-2 text-right font-semibold text-emerald-700">
                        {pct(r.d0, r.atribuidos)}%
                      </td>
                      <td className="py-2 text-right">{pct(r.d1, r.atribuidos)}%</td>
                      <td className="py-2 text-right">{pct(r.d2, r.atribuidos)}%</td>
                      <td className="py-2 text-right">{pct(r.d3plus, r.atribuidos)}%</td>
                      <td className="py-2 text-right text-slate-500">{pct(r.nunca, r.atribuidos)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              “Dia 0” = o vendedor mandou a 1ª mensagem humana no mesmo dia útil em que o lead
              chegou (exclui automações). D+1/D+2/D+3+ = dias ÚTEIS de atraso até a 1ª resposta
              (sexta→segunda = 1 dia, não conta fim de semana). “Não conversado” = nunca teve
              resposta humana. Base: conversas atribuídas a um vendedor nos últimos 30 dias — a
              janela desliza com o dia; o dado entra sozinho pelo webhook do Unnichat.
            </p>
          </>
        )}
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

        <Card title="Atendimento no dia 0 — falta gente ou falta processo?">
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
          {d0Load.length > 0 && (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400">
                    <th className="py-1.5 font-medium">Tipo de dia</th>
                    <th className="py-1.5 font-medium text-right">dias</th>
                    <th className="py-1.5 font-medium text-right">leads</th>
                    <th className="py-1.5 font-medium text-right">no dia 0</th>
                    <th className="py-1.5 font-medium text-right">nunca</th>
                  </tr>
                </thead>
                <tbody>
                  {d0Load.map((r) => (
                    <tr key={r.bucket} className="border-t border-slate-100">
                      <td className="py-1.5 text-slate-700">
                        {r.bucket === "calmo"
                          ? "Calmo (≤10 leads)"
                          : r.bucket === "medio"
                            ? "Médio (11-25)"
                            : "Pico (>25)"}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">{num(r.dias)}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700">{num(r.leads)}</td>
                      <td
                        className={`py-1.5 text-right font-semibold tabular-nums ${
                          r.leads > 0 && r.d0 / r.leads >= 0.6 ? "text-emerald-600" : "text-slate-900"
                        }`}
                      >
                        {r.leads > 0 ? `${num((r.d0 / r.leads) * 100, 0)}%` : "—"}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">
                        {r.leads > 0 ? `${num((r.nunca / r.leads) * 100, 0)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Leads atribuídos (30 dias)</dt>
              <dd className="font-semibold text-slate-900">{num(speedTotal.atribuidos)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Atendidos no mesmo dia útil (geral)</dt>
              <dd className="font-semibold text-slate-900">
                {d0Rate !== null ? `${num(d0Rate * 100, 0)}%` : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Time atual (vendedores ativos)</dt>
              <dd className="font-semibold text-slate-900">{num(activeSellers)}</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-400 mt-4">
            Como ler: se o dia 0 é alto no pico (todo mundo mobilizado) e baixo no dia calmo, o
            gargalo é rotina/processo — contratar não muda isso; um alerta de lead novo + meta de
            resposta no dia muda. Só se o pico for pior que o calmo é que falta gente. Dia 0 = 1ª
            resposta humana (exclui bot/template) no mesmo dia útil da chegada do lead; sexta→segunda
            conta 1 dia útil.
          </p>
        </Card>
      </div>
    </div>
  );
}

// Tabelinha estreita (cabe no mobile) de perfil × compradores. As faixas de
// temperatura ganham um pontinho de cor; o resto fica neutro.
const PERFIL_DOT: Record<string, string> = {
  "muito quente": "#e11d48",
  "quente A5E/Gig": "#f43f5e",
  quente: "#fb7185",
  morno: "#f59e0b",
  frio: "#0ea5e9",
  "muito frio": "#64748b",
};

function PerfilTable({ titulo, rows }: { titulo: string; rows: { perfil: string; n: number }[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.perfil} className="border-t border-slate-100">
              <td className="py-1.5 text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  {PERFIL_DOT[r.perfil] && (
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: PERFIL_DOT[r.perfil] }}
                    />
                  )}
                  {r.perfil}
                </span>
              </td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900 w-10">
                {r.n}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
