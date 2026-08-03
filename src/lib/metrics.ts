// Cálculos das métricas do dashboard: vendas por vendedor, leads por venda,
// ritmo diário de leads e análise de capacidade do time de vendas.

import type { DashboardData, Lead, Sale, Seller } from "./types";

// Todas as datas "de hoje"/intervalos do dashboard são calculadas no fuso de
// São Paulo (America/Sao_Paulo), e não em UTC — senão a virada do dia fica 3h
// adiantada (uma venda das 21h cairia no "amanhã").
const SP_TZ = "America/Sao_Paulo";

// Data no formato YYYY-MM-DD no fuso de São Paulo. ("en-CA" já formata YYYY-MM-DD.)
function spDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SP_TZ }).format(d);
}

export function isoToday(): string {
  return spDate(new Date());
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function daysAgo(n: number, from = new Date()): string {
  // Dia-calendário de São Paulo menos n dias (aritmética em UTC a partir da
  // meia-noite do dia SP — estável e sem efeito de horário de verão).
  const [y, m, d] = spDate(from).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

export function paidSales(sales: Sale[]): Sale[] {
  return sales.filter((s) => s.status === "paga");
}

export function inRange<T>(items: T[], getDate: (t: T) => string, start: string, end: string): T[] {
  return items.filter((i) => getDate(i) >= start && getDate(i) <= end);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

// ---------- Vendas por vendedor ----------

export interface SellerStats {
  seller: Seller;
  salesToday: number;
  salesMonth: number;
  revenueMonth: number;
  salesPrevMonth: number;
  leadsAssignedMonth: number;
  /** leads atribuídos no mês / vendas no mês (quanto menor, melhor) */
  leadsPerSaleMonth: number | null;
}

export function sellerStats(data: DashboardData, today = isoToday()): SellerStats[] {
  const month = monthKey(today);
  // Mês anterior por aritmética de string: setMonth(-1) numa Date de dia 31
  // pula um mês (31/mar - 1 mês = 03/mar, não fevereiro).
  const [py, pm] = month.split("-").map(Number);
  const prevMonth =
    pm === 1 ? `${py - 1}-12` : `${py}-${String(pm - 1).padStart(2, "0")}`;
  const sales = paidSales(data.sales);

  return data.sellers
    .filter((s) => s.isActive)
    .map((seller) => {
      const own = sales.filter((s) => s.sellerId === seller.id);
      const ownMonth = own.filter((s) => monthKey(s.saleDate) === month);
      const leadsAssignedMonth = data.leads.filter(
        (l) => l.sellerId === seller.id && monthKey(l.createdAt) === month
      ).length;
      return {
        seller,
        salesToday: own.filter((s) => s.saleDate === today).length,
        salesMonth: ownMonth.length,
        revenueMonth: sum(ownMonth.map((s) => s.amount)),
        salesPrevMonth: own.filter((s) => monthKey(s.saleDate) === prevMonth).length,
        leadsAssignedMonth,
        leadsPerSaleMonth: ownMonth.length > 0 ? leadsAssignedMonth / ownMonth.length : null,
      };
    });
}

// ---------- Funil ----------

export interface FunnelStage {
  label: string;
  count: number;
}

/** Piso de ticket pra uma venda contar como conversão do funil. */
export const TICKET_CONVERSAO = 600;

/**
 * Venda que conta como conversão do funil: curso (A5E / Gigantes) ou qualquer
 * produto acima do piso de ticket.
 *
 * O status "convertido" do CRM não serve pra isso: a automação marca o contato
 * como convertido quando ele compra QUALQUER coisa — ingresso de R$ 57,
 * checklist de R$ 50 — e o funil mostrava 24% de conversão, que não existe.
 */
export function isConversionSale(s: Sale): boolean {
  return isCourseSale(s) || s.amount >= TICKET_CONVERSAO;
}

export function funnelStages(leads: Lead[], sales: Sale[] = []): FunnelStage[] {
  const total = leads.length;
  const frio = leads.filter((l) => l.status === "frio").length;
  const espera = leads.filter((l) => l.status === "lista_espera").length;
  const quente = leads.filter((l) => l.status === "quente").length;
  const perdido = leads.filter((l) => l.status === "perdido").length;
  const convertidoCrm = leads.filter((l) => l.status === "convertido").length;

  // Converteu = tem venda de verdade ligada ao lead, e venda que conta.
  const doFunil = new Set(leads.map((l) => l.id));
  const comVenda = new Set(
    paidSales(sales)
      .filter((s) => s.leadId && doFunil.has(s.leadId) && isConversionSale(s))
      .map((s) => s.leadId as string)
  );

  return [
    { label: "Leads captados", count: total },
    { label: "Frios / lista de espera", count: frio + espera },
    { label: "Quentes (com vendedor)", count: quente + perdido + convertidoCrm },
    { label: "Convertidos (venda)", count: comVenda.size },
  ];
}

// ---------- Origem do lead ----------

/**
 * De onde o lead veio. O campo `source` do banco chega quase sempre como
 * "outro" (o Unnichat não manda origem), mas a informação existe nas TAGS que
 * a automação aplica — lista-de-espera, evento-4encontro, gigantes-*, lead-a5e.
 * Aqui a gente lê de lá, com o utm por cima quando existir.
 */
export function leadOrigem(l: Lead): string {
  const utm = l.utm?.source?.trim();
  if (utm) return utm.toLowerCase().includes("ig") || utm.toLowerCase().includes("fb")
    ? "Meta Ads"
    : utm;

  const raw = l.extra && typeof l.extra === "object" ? (l.extra as Record<string, unknown>).tags : null;
  const tags = String(raw ?? "").toLowerCase();

  if (tags.includes("4encontro") || tags.includes("evento-")) return "Evento (4º Encontro)";
  if (tags.includes("ingresso")) return "Evento (4º Encontro)";
  if (tags.includes("gigantes")) return "Gigantes";
  if (tags.includes("lead-a5e") || tags.includes("a5e")) return "A5E";
  if (tags.includes("lista-de-espera")) return "Lista de espera";
  if (tags.includes("respondeu-pesquisa") || tags.includes("pesquisa")) return "Pesquisa";
  if (tags.includes("imersao") || tags.includes("imersão")) return "Imersão";

  const produto = l.extra && typeof l.extra === "object"
    ? String((l.extra as Record<string, unknown>).produto ?? "")
    : "";
  if (produto) return produto.charAt(0).toUpperCase() + produto.slice(1);

  return "Sem origem";
}

// ---------- Ritmo de leads ----------

export interface DailyPoint {
  date: string;
  leads: number;
  /** média móvel de 7 dias */
  media7d: number | null;
}

export function dailyLeadSeries(leads: Lead[], days: number, today = isoToday()): DailyPoint[] {
  const start = daysAgo(days - 1, new Date(today));
  const byDay = new Map<string, number>();
  for (const l of leads) {
    if (l.createdAt >= start && l.createdAt <= today) {
      byDay.set(l.createdAt, (byDay.get(l.createdAt) ?? 0) + 1);
    }
  }
  const points: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgo(i, new Date(today));
    points.push({ date, leads: byDay.get(date) ?? 0, media7d: null });
  }
  for (let i = 0; i < points.length; i++) {
    if (i >= 6) {
      const window = points.slice(i - 6, i + 1);
      points[i].media7d = Math.round((sum(window.map((p) => p.leads)) / 7) * 10) / 10;
    }
  }
  return points;
}

// ---------- MQL (tag de qualificação no CRM) ----------
//
// MQL = contato que recebeu uma das tags lead-a5e / lead-gigantes /
// lead-quente / lead-muito-quente / lead-frio (muito-frio fica fora: 0% de
// conversão medida). O momento em que vira MQL é o momento em
// que a tag chega (leads.mql_at, carimbado pelo histórico de eventos) — não a
// atribuição a vendedor. isMqlLead é a definição única no app.

export function isMqlLead(l: Lead): boolean {
  return l.mqlAt != null;
}

export interface MqlDayPoint {
  date: string;
  leads: number;
  mql: number;
}

// leads contados pela data de captação; MQLs pela data em que viraram MQL
// (recebimento da tag) — por isso as duas linhas do gráfico têm datas próprias.
export function mqlDailySeries(leads: Lead[], days: number, today = isoToday()): MqlDayPoint[] {
  const start = daysAgo(days - 1, new Date(today));
  const byDay = new Map<string, { leads: number; mql: number }>();
  const bump = (d: string, k: "leads" | "mql") => {
    if (d < start || d > today) return;
    const e = byDay.get(d) ?? { leads: 0, mql: 0 };
    e[k]++;
    byDay.set(d, e);
  };
  for (const l of leads) {
    bump(l.createdAt.slice(0, 10), "leads");
    if (l.mqlAt) bump(l.mqlAt.slice(0, 10), "mql");
  }
  const out: MqlDayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(i, new Date(today));
    const e = byDay.get(d) ?? { leads: 0, mql: 0 };
    out.push({ date: d, leads: e.leads, mql: e.mql });
  }
  return out;
}

export interface MqlMonthPoint {
  month: string;      // YYYY-MM
  label: string;      // "jul/26"
  leads: number;
  mql: number;
  /** quanto FALTA pro mês fechar no ritmo atual (só no mês corrente) */
  leadsProj: number;
  mqlProj: number;
  taxa: number | null; // % de qualificação do mês
  parcial: boolean;    // mês corrente, ainda correndo
}

/**
 * Leads e MQL por MÊS. A série diária mostra o pulso; a mensal mostra a
 * tendência — 60 dias de linha não deixam ver se o mês está melhor ou pior
 * que o anterior.
 */
export function mqlMonthlySeries(
  leads: Lead[],
  months: number,
  today = isoToday()
): MqlMonthPoint[] {
  const mesAtual = today.slice(0, 7);
  const byMonth = new Map<string, { leads: number; mql: number }>();
  const bump = (d: string, k: "leads" | "mql") => {
    const m = d.slice(0, 7);
    const e = byMonth.get(m) ?? { leads: 0, mql: 0 };
    e[k]++;
    byMonth.set(m, e);
  };
  for (const l of leads) {
    bump(l.createdAt.slice(0, 10), "leads");
    if (l.mqlAt) bump(l.mqlAt.slice(0, 10), "mql");
  }

  const out: MqlMonthPoint[] = [];
  const [y0, m0] = mesAtual.split("-").map(Number);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y0, m0 - 1 - i, 1));
    const mk = d.toISOString().slice(0, 7);
    const e = byMonth.get(mk) ?? { leads: 0, mql: 0 };
    const parcial = mk === mesAtual;
    // Projeção do mês corrente: mantém o ritmo do que já correu até hoje.
    // (mesma régua do gráfico de faturamento por vendedor)
    const diaHoje = Number(today.slice(8, 10));
    const diasNoMes = new Date(Date.UTC(y0, m0, 0)).getUTCDate();
    const fator = parcial && diaHoje > 0 ? diasNoMes / diaHoje : 1;
    out.push({
      month: mk,
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }),
      leads: e.leads,
      mql: e.mql,
      leadsProj: parcial ? Math.max(0, Math.round(e.leads * fator) - e.leads) : 0,
      mqlProj: parcial ? Math.max(0, Math.round(e.mql * fator) - e.mql) : 0,
      taxa: e.leads > 0 ? (e.mql / e.leads) * 100 : null,
      parcial,
    });
  }
  return out;
}

export interface MqlSellerRow {
  sellerId: string;
  name: string;
  mql: number;
  perMonth: number;
}

// Quantos MQL (pela tag) cada vendedor ATIVO processou na janela, e a média
// por vendedor/mês — referência de "quanto 1 vendedor consegue processar".
// Janela pela data em que o lead virou MQL (mql_at), não pela captação.
export function mqlPerSeller(
  data: DashboardData,
  days = 90,
  today = isoToday()
): { rows: MqlSellerRow[]; avgPerMonth: number; totalMql: number; months: number } {
  const start = daysAgo(days - 1, new Date(today));
  const nameById = new Map(data.sellers.map((s) => [s.id, s.name]));
  const activeIds = new Set(data.sellers.filter((s) => s.isActive).map((s) => s.id));
  const counts = new Map<string, number>();
  for (const l of data.leads) {
    if (!l.mqlAt || !l.sellerId || !activeIds.has(l.sellerId)) continue;
    const d = l.mqlAt.slice(0, 10);
    if (d < start || d > today) continue;
    counts.set(l.sellerId, (counts.get(l.sellerId) ?? 0) + 1);
  }
  const months = days / 30;
  const rows = [...counts.entries()]
    .map(([id, n]) => ({
      sellerId: id,
      name: nameById.get(id) ?? "(sem nome)",
      mql: n,
      perMonth: Math.round(n / months),
    }))
    .sort((a, b) => b.mql - a.mql);
  const totalMql = rows.reduce((s, r) => s + r.mql, 0);
  const avgPerMonth = rows.length > 0 ? Math.round(totalMql / rows.length / months) : 0;
  return { rows, avgPerMonth, totalMql, months };
}

// ---------- Capacidade do time ----------

export interface CapacityAnalysis {
  /** leads captados nos últimos 30 dias */
  leads30d: number;
  /** vendas pagas nos últimos 30 dias */
  sales30d: number;
  /** leads necessários para fechar 1 venda — MEDIANA dos meses fechados (robusto a lançamento) */
  leadsPerSale: number | null;
  /** leads de um mês típico (mediana dos meses fechados) — base robusta da capacidade */
  robustMonthlyLeads: number | null;
  /** quantos meses fechados entraram nas medianas */
  monthsConsidered: number;
  /** vendas/mês do vendedor mais produtivo nos últimos 3 meses fechados */
  sellerMonthlyCapacity: number;
  /** leads/mês necessários para manter 1 vendedor na capacidade máxima */
  leadsNeededPerSeller: number | null;
  activeSellers: number;
  /** quantos vendedores o volume atual de leads sustenta */
  supportedSellers: number | null;
  /** leads/mês que faltam (ou sobram, se negativo) para sustentar +1 vendedor */
  leadsGapForNextSeller: number | null;
  verdict: "pode_contratar" | "quase" | "falta_lead" | "sem_dados";
}

// ---------- Helpers robustos (mediana, meses fechados) ----------

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Os N meses FECHADOS antes do mês corrente (mais recente primeiro).
function lastClosedMonths(today: string, n: number): string[] {
  const d = new Date(today + "T00:00:00");
  d.setDate(1);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    d.setMonth(d.getMonth() - 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function countByMonth<T>(items: T[], dateFn: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = monthKey(dateFn(it));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// Contagem por DIA dentro de [start,end], incluindo dias zerados — para tirar
// a mediana diária (robusta a picos de lançamento).
function dailyCounts<T>(items: T[], dateFn: (t: T) => string, start: string, end: string): number[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    const d = dateFn(it).slice(0, 10);
    if (d < start || d > end) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const out: number[] = [];
  const cur = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (cur <= last) {
    const k = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    out.push(counts.get(k) ?? 0);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function capacityAnalysis(data: DashboardData, today = isoToday()): CapacityAnalysis {
  const start30 = daysAgo(29, new Date(today));
  const leads30d = inRange(data.leads, (l) => l.createdAt, start30, today).length;
  const sales30d = inRange(paidSales(data.sales), (s) => s.saleDate, start30, today).length;

  // ROBUSTO: trabalha com MESES FECHADOS e usa MEDIANA, para um lançamento
  // (pico de leads numa janela) não distorcer "leads/venda" nem quantos
  // vendedores o volume sustenta.
  const currentMonth = monthKey(today);
  const closed = lastClosedMonths(today, 6);
  const leadsBy = countByMonth(data.leads, (l) => l.createdAt);
  const salesBy = countByMonth(paidSales(data.sales), (s) => s.saleDate);
  const leadsForMedian: number[] = [];
  const ratios: number[] = [];
  for (const m of closed) {
    const lm = leadsBy.get(m) ?? 0;
    const sm = salesBy.get(m) ?? 0;
    if (lm > 0) leadsForMedian.push(lm);
    if (lm > 0 && sm > 0) ratios.push(lm / sm);
  }
  const leadsPerSale = median(ratios);
  const robustMonthlyLeads = median(leadsForMedian);
  const monthsConsidered = leadsForMedian.length;

  // Capacidade: melhor mês de um vendedor ATIVO nos últimos 3 meses completos.
  // Vendas sem vendedor (anúncio/lançamento) não contam.
  const activeSellerIds = new Set(data.sellers.filter((s) => s.isActive).map((s) => s.id));
  const perSellerMonth = new Map<string, number>();
  for (const s of paidSales(data.sales)) {
    const mk = monthKey(s.saleDate);
    if (mk === currentMonth) continue;
    if (!s.sellerId || !activeSellerIds.has(s.sellerId)) continue;
    const key = `${s.sellerId}|${mk}`;
    perSellerMonth.set(key, (perSellerMonth.get(key) ?? 0) + 1);
  }
  const capMonths = [...new Set([...perSellerMonth.keys()].map((k) => k.split("|")[1]))]
    .sort()
    .slice(-3);
  const sellerMonthlyCapacity = Math.max(
    0,
    ...[...perSellerMonth.entries()]
      .filter(([k]) => capMonths.includes(k.split("|")[1]))
      .map(([, v]) => v)
  );

  const activeSellers = data.sellers.filter((s) => s.isActive).length;
  const leadsNeededPerSeller =
    leadsPerSale !== null && sellerMonthlyCapacity > 0 ? leadsPerSale * sellerMonthlyCapacity : null;
  const supportedSellers =
    leadsNeededPerSeller && leadsNeededPerSeller > 0 && robustMonthlyLeads !== null
      ? Math.floor(robustMonthlyLeads / leadsNeededPerSeller)
      : null;
  const leadsGapForNextSeller =
    leadsNeededPerSeller !== null && robustMonthlyLeads !== null
      ? Math.ceil(leadsNeededPerSeller * (activeSellers + 1) - robustMonthlyLeads)
      : null;

  let verdict: CapacityAnalysis["verdict"] = "sem_dados";
  if (supportedSellers !== null && leadsGapForNextSeller !== null && robustMonthlyLeads !== null) {
    if (supportedSellers >= activeSellers + 1) verdict = "pode_contratar";
    else if (leadsGapForNextSeller <= robustMonthlyLeads * 0.15) verdict = "quase";
    else verdict = "falta_lead";
  }

  return {
    leads30d,
    sales30d,
    leadsPerSale,
    robustMonthlyLeads,
    monthsConsidered,
    sellerMonthlyCapacity,
    leadsNeededPerSeller,
    activeSellers,
    supportedSellers,
    leadsGapForNextSeller,
    verdict,
  };
}

// ---------- Capacidade do time: base QUALIFICADA (últimos 30 dias) ----------
//
// O vendedor só trabalha leads "quentes" e "muito quentes" — não fala com todo
// mundo. Então, para o diagnóstico de gargalo, a capacidade é medida sobre os
// leads QUALIFICADOS, não sobre o total. Como o banco só guarda o estágio ATUAL
// de cada lead (não dá pra reconstruir o histórico de qualificação), usamos a
// janela dos últimos 30 dias, com o ritmo robusto a pico (mediana diária × 30).

// Lead "qualificado" = está numa etapa QUENTE do pipeline. Casa por padrão
// (contém "quente"), então funciona tanto com os nomes antigos
// ("Leads Quentes", "Leads Muito Quentes") quanto com os novos por produto
// ("Quente A5E", "Quente Gigantes") — sem precisar mexer no código a cada
// renomeação de etapa no Unnichat. Etapas "frias" não contêm "quente".
export function isQualifiedLead(l: Lead): boolean {
  return (l.pipelineStage ?? "").toLowerCase().includes("quente");
}

// Venda de CURSO (Anfitrião 5 Estrelas ou Gigantes da Temporada) — é o que o
// vendedor de fato vende. Exclui ingressos do evento, grupo/cadeira adicional,
// checklists e outros produtos avulsos, que não contam como "venda" aqui.
const COURSE_EXCLUDE = ["encontro", "ingresso", "grupo", "cadeira", "pessoa adicional", "checklist"];
export function isCourseSale(s: Sale): boolean {
  const p = (s.product ?? "").toLowerCase();
  if (COURSE_EXCLUDE.some((w) => p.includes(w))) return false;
  return p.includes("5 estrelas") || p.includes("gigantes da temporada");
}

export interface QualifiedCapacity {
  qualified30: number; // soma de qualificados nos últimos 30 dias
  robustMonthlyLeads: number | null; // ritmo mensal robusto (mediana diária × 30)
  sales30: number;
  leadsPerSale: number | null; // qualificados por venda
  sellerMonthlyCapacity: number;
  activeSellers: number;
  supportedSellers: number | null;
  leadsGapForNextSeller: number | null;
  verdict: CapacityAnalysis["verdict"];
  /** true quando há mais vendas que leads qualificados (funil do CRM não captura) — conta não confiável */
  unreliable: boolean;
}

export function qualifiedCapacity30d(data: DashboardData, today = isoToday()): QualifiedCapacity {
  const start30 = daysAgo(29, new Date(today));
  const qLeads = data.leads.filter(isQualifiedLead);
  const qualified30 = inRange(qLeads, (l) => l.createdAt, start30, today).length;
  // ritmo robusto a pico de lançamento: mediana do nº diário × 30
  const medDaily = median(dailyCounts(qLeads, (l) => l.createdAt, start30, today)) ?? 0;
  const robustMonthlyLeads = qualified30 > 0 ? Math.round(medDaily * 30) : null;

  // "Venda" aqui = só CURSO (A5E + Gigantes). Ingressos do evento e produtos
  // avulsos não contam — senão um lançamento de ingressos distorce a conta.
  const courseSales = paidSales(data.sales).filter(isCourseSale);
  const sales30 = inRange(courseSales, (s) => s.saleDate, start30, today).length;
  const leadsPerSale = sales30 > 0 && qualified30 > 0 ? qualified30 / sales30 : null;

  // Capacidade de venda do melhor vendedor ATIVO (3 meses fechados) — só vendas
  // de curso; mede o quanto um vendedor entrega, não o volume de leads.
  const currentMonth = monthKey(today);
  const activeSellerIds = new Set(data.sellers.filter((s) => s.isActive).map((s) => s.id));
  const perSellerMonth = new Map<string, number>();
  for (const s of courseSales) {
    const mk = monthKey(s.saleDate);
    if (mk === currentMonth) continue;
    if (!s.sellerId || !activeSellerIds.has(s.sellerId)) continue;
    const key = `${s.sellerId}|${mk}`;
    perSellerMonth.set(key, (perSellerMonth.get(key) ?? 0) + 1);
  }
  const capMonths = [...new Set([...perSellerMonth.keys()].map((k) => k.split("|")[1]))]
    .sort()
    .slice(-3);
  const sellerMonthlyCapacity = Math.max(
    0,
    ...[...perSellerMonth.entries()]
      .filter(([k]) => capMonths.includes(k.split("|")[1]))
      .map(([, v]) => v)
  );

  const activeSellers = data.sellers.filter((s) => s.isActive).length;
  // Se há MAIS vendas de curso do que leads qualificados na janela, o funil do
  // CRM não está capturando os leads quentes (leadsPerSale < 1, sem sentido).
  // Marca como não confiável em vez de cuspir "cada venda exige ~0".
  const unreliable = leadsPerSale !== null && leadsPerSale < 1;
  const leadsNeededPerSeller =
    leadsPerSale !== null && sellerMonthlyCapacity > 0 ? leadsPerSale * sellerMonthlyCapacity : null;
  const supportedSellers =
    !unreliable && leadsNeededPerSeller && leadsNeededPerSeller > 0 && robustMonthlyLeads !== null
      ? Math.floor(robustMonthlyLeads / leadsNeededPerSeller)
      : null;
  const leadsGapForNextSeller =
    !unreliable && leadsNeededPerSeller !== null && robustMonthlyLeads !== null
      ? Math.ceil(leadsNeededPerSeller * (activeSellers + 1) - robustMonthlyLeads)
      : null;

  let verdict: CapacityAnalysis["verdict"] = "sem_dados";
  if (
    !unreliable &&
    supportedSellers !== null &&
    leadsGapForNextSeller !== null &&
    robustMonthlyLeads !== null
  ) {
    if (supportedSellers >= activeSellers + 1) verdict = "pode_contratar";
    else if (leadsGapForNextSeller <= robustMonthlyLeads * 0.15) verdict = "quase";
    else verdict = "falta_lead";
  }

  return {
    qualified30,
    robustMonthlyLeads,
    sales30,
    leadsPerSale,
    sellerMonthlyCapacity,
    activeSellers,
    supportedSellers,
    leadsGapForNextSeller,
    verdict,
    unreliable,
  };
}

// ---------- Financeiro ----------

export interface MonthlyCashflow {
  month: string; // YYYY-MM
  entradas: number;
  saidas: number;
  resultado: number;
}

export function monthlyCashflow(data: DashboardData, monthsBack = 6): MonthlyCashflow[] {
  const map = new Map<string, { in: number; out: number }>();
  for (const t of data.finTransactions) {
    const mk = monthKey(t.transactionDate);
    const entry = map.get(mk) ?? { in: 0, out: 0 };
    if (t.direction === "in") entry.in += t.amount;
    else entry.out += t.amount;
    map.set(mk, entry);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-monthsBack)
    .map(([month, v]) => ({
      month,
      entradas: Math.round(v.in),
      saidas: Math.round(v.out),
      resultado: Math.round(v.in - v.out),
    }));
}

export function spendByCategory(
  data: DashboardData,
  start: string,
  end: string
): { category: string; total: number }[] {
  const catName = new Map(data.finCategories.map((c) => [c.id, c.name]));
  const totals = new Map<string, number>();
  for (const t of data.finTransactions) {
    if (t.direction !== "out") continue;
    if (t.transactionDate < start || t.transactionDate > end) continue;
    const name = (t.categoryId && catName.get(t.categoryId)) || "Sem categoria";
    totals.set(name, (totals.get(name) ?? 0) + t.amount);
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total);
}

// ---------- Resultado mensal (faturamento, custos, distribuição, margem) ----------
//
// Tudo sai do extrato do Inter (fin_transactions) — é o dinheiro que de fato
// entrou e saiu da conta, o mesmo lastro da Provisão de caixa.

// Saída pros sócios = distribuição, não custo. Espelha
// distribuicao_socios.match_extrato (migração 0021_distribuicao_socios).
const RE_SOCIO = /(romulo|rômulo|luis fernando|luiz fernando|heavy ?drops)/i;

// Entrada que NÃO é faturamento: resgate de aplicação (dinheiro nosso voltando),
// aporte de sócio, pix devolvido/estornado e transferência entre as empresas do
// grupo. Sem isso o mês de julho aparecia R$ 48 mil maior do que vendeu.
const RE_NAO_FATURAMENTO =
  /(resgate|devolvid|estorn|canal do anfitri[ãa]o)/i;

export interface ResultadoMesPoint {
  month: string; // YYYY-MM
  label: string; // "jul/26"
  faturamento: number;
  custos: number;
  distribuicao: number;
  /** Margem líquida = (faturamento − custos) / faturamento, em %. */
  margem: number | null;
  parcial: boolean; // mês corrente, ainda correndo
  /** Quanto ainda deve entrar/sair até o fim do mês, no ritmo atual. */
  faturamentoProj: number;
  custosProj: number;
}

/**
 * Faturamento, custos, distribuição e margem líquida por mês.
 *
 * A distribuição sai da conta de "custos" de propósito: não é despesa, é lucro
 * indo pro bolso dos sócios (foi assim que combinamos de ler a margem). O mês
 * corrente é projetado proporcionalmente aos dias corridos, como na projeção de
 * vendas — mas só faturamento e custos: a distribuição acontece de uma vez, lá
 * pelo dia 10, e projetá-la proporcionalmente inventaria número.
 */
export function resultadoMensalSeries(
  data: DashboardData,
  months = 6,
  today = isoToday()
): ResultadoMesPoint[] {
  const mesAtual = today.slice(0, 7);
  const by = new Map<string, { fat: number; custo: number; dist: number }>();
  for (const t of data.finTransactions) {
    const mk = t.transactionDate.slice(0, 7);
    const e = by.get(mk) ?? { fat: 0, custo: 0, dist: 0 };
    const texto = `${t.counterparty ?? ""} ${t.description ?? ""}`;
    if (t.direction === "in") {
      if (!RE_NAO_FATURAMENTO.test(texto) && !RE_SOCIO.test(texto)) e.fat += t.amount;
    } else if (RE_SOCIO.test(texto)) {
      e.dist += t.amount;
    } else {
      e.custo += t.amount;
    }
    by.set(mk, e);
  }

  const diaHoje = Number(today.slice(8, 10));
  const [y0, m0] = mesAtual.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(y0, m0, 0)).getUTCDate();
  const fator = diaHoje > 0 ? diasNoMes / diaHoje : 1;

  const out: ResultadoMesPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y0, m0 - 1 - i, 1));
    const mk = d.toISOString().slice(0, 7);
    const e = by.get(mk) ?? { fat: 0, custo: 0, dist: 0 };
    const parcial = mk === mesAtual;
    const fatProj = parcial ? Math.max(0, Math.round(e.fat * fator) - Math.round(e.fat)) : 0;
    const custoProj = parcial ? Math.max(0, Math.round(e.custo * fator) - Math.round(e.custo)) : 0;
    const fatTotal = Math.round(e.fat) + fatProj;
    const custoTotal = Math.round(e.custo) + custoProj;
    out.push({
      month: mk,
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }),
      faturamento: Math.round(e.fat),
      custos: Math.round(e.custo),
      distribuicao: Math.round(e.dist),
      margem: fatTotal > 0 ? ((fatTotal - custoTotal) / fatTotal) * 100 : null,
      parcial,
      faturamentoProj: fatProj,
      custosProj: custoProj,
    });
  }
  return out;
}

// ---------- Restrição (Teoria das Restrições) ----------
//
// Goldratt: o throughput que interessa aqui é LUCRO LÍQUIDO, e a restrição é
// o recurso que limita esse throughput — UMA por vez. "Piorou" não é
// restrição: conversão caindo é sintoma e vira alerta de tendência; restrição
// é falta de capacidade num elo — o time, o processo de atendimento ou a
// geração de lead qualificado. Cada candidata carrega o ganho estimado de
// ELEVÁ-LA em R$/mês de venda de curso, porque restrição se compara em
// dinheiro, não em porcentagem.

// Resumo de velocidade de atendimento (speed-to-lead), vindo da função SQL
// seller_speed_to_lead — passado à análise de restrição.
export interface SpeedSummary {
  atribuidos: number;
  conversados: number;
  d0: number;
  d1: number;
  d2: number;
  d3plus: number;
  nunca: number;
}

/** Fatia do estudo calmo×pico (d0_by_day_load) — só o que a análise usa. */
export interface D0LoadLite {
  bucket: "calmo" | "medio" | "pico";
  leads: number;
  d0: number;
}

export type RestricaoStatus = "ok" | "atencao" | "critico";
export type RestricaoKind = "time" | "processo" | "demanda";

export interface RestricaoCandidata {
  kind: RestricaoKind;
  label: string;
  /** 0-100: força da evidência de que ESTE elo limita o throughput hoje */
  score: number;
  status: RestricaoStatus;
  headline: string;
  detail: string;
  /** como explorar/elevar (passos 2 e 4 dos cinco passos de focalização) */
  acao: string;
  /** throughput estimado ao elevar: R$/mês em venda de curso (ordem de grandeza) */
  ganhoMensal: number | null;
}

export interface TendenciaAlerta {
  kind: "conversao" | "midia" | "leads";
  label: string;
  status: RestricaoStatus;
  headline: string;
  detail: string;
}

export interface RestricaoAnalysis {
  /** A candidata com mais evidência — em ToC é uma por vez, não um ranking. */
  restricao: RestricaoCandidata | null;
  candidatas: RestricaoCandidata[];
  alertas: TendenciaAlerta[];
  ticketCurso: number | null;
  hasData: boolean;
}

function statusFor(score: number): RestricaoStatus {
  return score >= 70 ? "critico" : score >= 40 ? "atencao" : "ok";
}

function fmtPct(ratio: number): string {
  return `${Math.round(Math.abs(ratio) * 100)}%`;
}

function fmtBrl(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

// Do estudo de speed-to-lead (90 dias, dias úteis): lead conversado converte
// ~10%; quem nunca é conversado, ~3%. É a base dos ganhos estimados abaixo.
const CONV_CONVERSADO = 0.1;
const CONV_NUNCA = 0.03;

/** Ticket mediano de venda de curso (90 dias) — mediana resiste a promoção. */
export function ticketMedioCurso(data: DashboardData, today = isoToday()): number | null {
  const start = daysAgo(89, new Date(today));
  const vals = inRange(
    paidSales(data.sales).filter(isCourseSale),
    (s) => s.saleDate,
    start,
    today
  ).map((s) => s.amount);
  return median(vals);
}

export function restricaoAnalysis(
  data: DashboardData,
  today = isoToday(),
  speed?: SpeedSummary | null,
  d0Load?: D0LoadLite[] | null,
  /** janela (em dias) usada pra medir o speed — pra normalizar ganhos a /mês */
  speedDays = 90
): RestricaoAnalysis {
  const ticket = ticketMedioCurso(data, today);
  const cap = qualifiedCapacity30d(data, today);
  const candidatas: RestricaoCandidata[] = [];

  // Vendas/mês que os leads atuais sustentam vs teto do time — usado pelas
  // duas primeiras candidatas (são os dois lados da mesma conta).
  const possiveis =
    !cap.unreliable && cap.leadsPerSale && cap.robustMonthlyLeads !== null
      ? cap.robustMonthlyLeads / cap.leadsPerSale
      : null;
  const tetoTime = cap.activeSellers * cap.sellerMonthlyCapacity;

  // ---- Candidata 1: o TIME é a restrição (lead qualificado sobrando) ----
  {
    let score = 15;
    let headline = "Time dá conta do volume de leads qualificados";
    let detail: string;
    let acao = "Nada a elevar aqui agora.";
    let ganho: number | null = null;

    if (cap.unreliable) {
      score = 5;
      headline = "Capacidade não estimável (CRM não captura os quentes)";
      detail = `Nos últimos 30 dias houve ${cap.sales30} vendas de curso para ~${cap.qualified30} leads quentes registrados — mais venda que lead quente. Boa parte das vendas não passa pelo funil do CRM, então não dá pra saber se o time é a restrição.`;
      acao = "Garanta o registro dos leads quentes no Unnichat antes de decidir contratação.";
    } else if (cap.supportedSellers === null) {
      detail =
        "Ainda não há leads qualificados suficientes nos últimos 30 dias para estimar a capacidade.";
    } else if (cap.verdict === "pode_contratar") {
      score = 85;
      headline = "O time é a restrição: tem lead qualificado sobrando";
      ganho = ticket !== null ? Math.round(cap.sellerMonthlyCapacity * ticket) : null;
      detail = `Entram ~${cap.robustMonthlyLeads} leads qualificados/mês e cada venda de curso exige ~${cap.leadsPerSale !== null ? cap.leadsPerSale.toFixed(1).replace(".", ",") : "?"}. Isso sustenta ${cap.supportedSellers} vendedor(es); o time tem ${cap.activeSellers}. Lead quente esperando é throughput evaporando — a fila de hoje não volta amanhã.`;
      acao = `ELEVAR: contratar (ou ativar) mais um vendedor — no pico, um vendedor entrega ${cap.sellerMonthlyCapacity} vendas de curso/mês.`;
    } else if (cap.verdict === "quase") {
      score = 45;
      headline = "Time perto de virar a restrição";
      detail = `Faltam ~${cap.leadsGapForNextSeller} leads qualificados/mês para justificar o próximo vendedor. No ritmo atual, o time satura em breve.`;
      acao = "EXPLORAR: prepare a próxima contratação antes de a fila se formar.";
    } else {
      detail = `Entram ~${cap.robustMonthlyLeads ?? 0} leads qualificados/mês; o time de ${cap.activeSellers} dá conta com folga.`;
    }
    candidatas.push({
      kind: "time",
      label: "Capacidade do time",
      score,
      status: statusFor(score),
      headline,
      detail,
      acao,
      ganhoMensal: ganho,
    });
  }

  // ---- Candidata 2: a DEMANDA é a restrição (time ocioso, falta lead) ----
  {
    const ocioso =
      !cap.unreliable &&
      cap.supportedSellers !== null &&
      cap.supportedSellers < cap.activeSellers;
    const gapVendas =
      possiveis !== null ? Math.max(0, Math.round(tetoTime - possiveis)) : null;

    let score = 15;
    let headline = "Demanda ocupa o time — não é o elo fraco hoje";
    let detail =
      "O volume de leads qualificados sustenta o time atual; a restrição não está na captação.";
    let acao = "Mantenha o ritmo de captação.";
    let ganho: number | null = null;

    if (cap.unreliable) {
      score = 5;
      headline = "Não estimável (mesmo motivo da capacidade)";
      detail = "Sem funil confiável de leads quentes no CRM, não dá pra medir a demanda.";
      acao = "Registre os quentes no CRM primeiro.";
    } else if (ocioso && gapVendas !== null && gapVendas > 0) {
      score = gapVendas >= cap.sellerMonthlyCapacity ? 75 : 55;
      headline = "A geração de lead qualificado é a restrição: time ocioso";
      ganho = ticket !== null ? Math.round(gapVendas * ticket) : null;
      detail = `Os ~${cap.robustMonthlyLeads} qualificados/mês sustentam ~${possiveis !== null ? Math.round(possiveis) : "?"} vendas de curso, mas o time de ${cap.activeSellers} comporta até ~${tetoTime}. Sobra gente, falta lead quente.`;
      acao =
        "ELEVAR: mais captação e qualificação (mídia, orgânico, varrer a base fria). Contratar agora só aumentaria a ociosidade.";
    }
    candidatas.push({
      kind: "demanda",
      label: "Geração de lead qualificado",
      score,
      status: statusFor(score),
      headline,
      detail,
      acao,
      ganhoMensal: ganho,
    });
  }

  // ---- Candidata 3: o PROCESSO de atendimento é a restrição (dia 0) ----
  if (speed && speed.atribuidos > 0) {
    const d0Rate = speed.d0 / speed.atribuidos;
    let score = 15;
    if (d0Rate < 0.4) score = 80;
    else if (d0Rate < 0.6) score = 55;
    const r0 = Math.round(d0Rate * 100);

    // calmo×pico decide o diagnóstico: d0 ruim no dia CALMO é rotina; d0 que
    // só cai no pico é volume — e aí a restrição de verdade é o time.
    let diagnostico = "";
    if (d0Load && d0Load.length > 0) {
      const rate = (b: D0LoadLite["bucket"]) => {
        const x = d0Load.find((r) => r.bucket === b);
        return x && x.leads > 0 ? x.d0 / x.leads : null;
      };
      const rc = rate("calmo");
      const rp = rate("pico");
      if (rc !== null && rp !== null) {
        diagnostico =
          rc <= rp
            ? " O estudo calmo×pico mostra d0 pior (ou igual) nos dias CALMOS — é disciplina de rotina, não headcount."
            : " O d0 só piora nos dias de pico — aí é volume; se persistir, a restrição é o time, não o processo.";
      }
    }

    const ganho =
      ticket !== null
        ? Math.round(speed.nunca * (CONV_CONVERSADO - CONV_NUNCA) * ticket * (30 / speedDays))
        : null;
    candidatas.push({
      kind: "processo",
      label: "Processo de atendimento (dia 0)",
      score,
      status: statusFor(score),
      headline:
        score >= 70
          ? `${100 - r0}% dos quentes não são atendidos no mesmo dia útil`
          : score >= 40
            ? `${100 - r0}% dos quentes esperam mais de um dia útil`
            : "Atendimento no dia 0 saudável",
      detail: `Só ${r0}% dos leads quentes são atendidos no mesmo dia útil e ${speed.nunca} nunca foram conversados na janela. Lead conversado converte ~10%; nunca conversado, ~3% — fila morta é throughput perdido.${diagnostico}`,
      acao:
        score >= 40
          ? "EXPLORAR antes de gastar: alerta de lead novo no WhatsApp, meta de 1ª resposta no mesmo dia e varredura diária da fila de nunca-conversados."
          : "Rotina de dia 0 funcionando — sem fila se formando.",
      ganhoMensal: score >= 40 ? ganho : null,
    });
  }

  candidatas.sort((a, b) => b.score - a.score);

  // ---- Alertas de tendência: sintomas. Nenhum deles é restrição. ----
  const alertas: TendenciaAlerta[] = [];
  const curStart = daysAgo(29, new Date(today));
  const prevStart = daysAgo(59, new Date(today));
  const prevEnd = daysAgo(30, new Date(today));

  // Conversão LEAD → venda de CURSO, meses fechados, mediana 3×3. Ingresso e
  // produto avulso ficam fora: eram eles que produziam "conversão de 84%" (o
  // numerador tinha 523 ingressos de evento pra 783 leads de curso).
  {
    const closed = lastClosedMonths(today, 6);
    const leadsBy = countByMonth(data.leads, (l) => l.createdAt);
    const cursoBy = countByMonth(paidSales(data.sales).filter(isCourseSale), (s) => s.saleDate);
    const conv = closed.map((m) => {
      const lm = leadsBy.get(m) ?? 0;
      const sm = cursoBy.get(m) ?? 0;
      return lm > 0 ? sm / lm : null;
    });
    const cur = median(conv.slice(0, 3).filter((x): x is number => x !== null));
    const prev = median(conv.slice(3, 6).filter((x): x is number => x !== null));
    const trend = cur !== null && prev !== null && prev > 0 ? (cur - prev) / prev : null;
    const drop = trend !== null ? Math.max(0, -trend) : 0;
    const status: RestricaoStatus = drop >= 0.25 ? "critico" : drop >= 0.1 ? "atencao" : "ok";
    alertas.push({
      kind: "conversao",
      label: "Conversão em venda de curso",
      status,
      headline:
        status === "ok" ? "Conversão estável" : `Conversão de curso caiu ${fmtPct(trend ?? 0)}`,
      detail:
        cur !== null && prev !== null
          ? `A cada 100 leads, ${(cur * 100).toFixed(1).replace(".", ",")} viram venda de curso agora, contra ${(prev * 100).toFixed(1).replace(".", ",")} no trimestre anterior (mediana de meses fechados; só A5E + Gigantes contam).`
          : "Sem meses fechados suficientes para comparar.",
    });
  }

  // Custo de anúncio por venda de curso (mesmo numerador da conversão).
  {
    const cursoSales = paidSales(data.sales).filter(isCourseSale);
    const sCur = inRange(cursoSales, (s) => s.saleDate, curStart, today).length;
    const sPrev = inRange(cursoSales, (s) => s.saleDate, prevStart, prevEnd).length;
    const adCur = sum(inRange(data.adSpend, (a) => a.date, curStart, today).map((a) => a.amount));
    const adPrev = sum(
      inRange(data.adSpend, (a) => a.date, prevStart, prevEnd).map((a) => a.amount)
    );
    const cacCur = sCur > 0 && adCur > 0 ? adCur / sCur : null;
    const cacPrev = sPrev > 0 && adPrev > 0 ? adPrev / sPrev : null;
    const trend = cacCur !== null && cacPrev !== null ? (cacCur - cacPrev) / cacPrev : null;
    const rise = trend !== null ? Math.max(0, trend) : 0;
    const status: RestricaoStatus = rise >= 0.3 ? "critico" : rise >= 0.15 ? "atencao" : "ok";
    alertas.push({
      kind: "midia",
      label: "Custo de anúncio por venda de curso",
      status,
      headline:
        status === "ok"
          ? "Mídia com custo sob controle"
          : `Custo por venda de curso subiu ${fmtPct(trend ?? 0)}`,
      detail:
        cacCur !== null && cacPrev !== null
          ? `${fmtBrl(cacCur)} por venda de curso nos últimos 30 dias, contra ${fmtBrl(cacPrev)} nos 30 anteriores.`
          : cacCur !== null
            ? `${fmtBrl(cacCur)} por venda de curso nos últimos 30 dias (sem base anterior pra comparar).`
            : "Sem investimento ou vendas suficientes para calcular.",
    });
  }

  // Ritmo de entrada de leads (mediana diária, imune a pico de lançamento).
  {
    const medCur = median(dailyCounts(data.leads, (l) => l.createdAt, curStart, today)) ?? 0;
    const medPrev = median(dailyCounts(data.leads, (l) => l.createdAt, prevStart, prevEnd)) ?? 0;
    const trend = medPrev > 0 ? (medCur - medPrev) / medPrev : null;
    const drop = trend !== null ? Math.max(0, -trend) : 0;
    const status: RestricaoStatus = drop >= 0.25 ? "critico" : drop >= 0.1 ? "atencao" : "ok";
    const r1 = (x: number) => x.toFixed(1).replace(".", ",");
    alertas.push({
      kind: "leads",
      label: "Entrada de leads",
      status,
      headline:
        status === "ok" ? "Entrada de leads saudável" : `Ritmo de leads caiu ${fmtPct(trend ?? 0)}`,
      detail:
        trend === null
          ? `Ritmo de ${r1(medCur)} leads/dia (mediana), sem base anterior pra comparar.`
          : `${r1(medCur)} leads/dia (mediana) agora, contra ${r1(medPrev)}/dia nos 30 anteriores.`,
    });
  }

  const peso: Record<RestricaoStatus, number> = { critico: 2, atencao: 1, ok: 0 };
  alertas.sort((a, b) => peso[b.status] - peso[a.status]);

  const hasData = data.leads.length > 0 || paidSales(data.sales).length > 0;
  const restricao =
    hasData && candidatas.length > 0 && candidatas[0].score >= 40 ? candidatas[0] : null;
  return { restricao, candidatas, alertas, ticketCurso: ticket, hasData };
}
