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
  const prevDate = new Date(today);
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = monthKey(prevDate.toISOString().slice(0, 10));
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

export function funnelStages(leads: Lead[]): FunnelStage[] {
  const total = leads.length;
  const frio = leads.filter((l) => l.status === "frio").length;
  const espera = leads.filter((l) => l.status === "lista_espera").length;
  const quente = leads.filter((l) => l.status === "quente").length;
  const perdido = leads.filter((l) => l.status === "perdido").length;
  const convertido = leads.filter((l) => l.status === "convertido").length;
  return [
    { label: "Leads captados", count: total },
    { label: "Frios / lista de espera", count: frio + espera },
    { label: "Quentes (com vendedor)", count: quente + perdido + convertido },
    { label: "Convertidos (venda)", count: convertido },
  ];
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

// ---------- Diagnóstico de gargalo ----------
// Compara os últimos 30 dias com os 30 anteriores e pontua cada possível
// freio do crescimento; o maior score é o gargalo a atacar primeiro.

export type BottleneckStatus = "ok" | "atencao" | "critico";

// Resumo de velocidade de atendimento (speed-to-lead), vindo da função SQL
// seller_speed_to_lead — passado ao diagnóstico de gargalo.
export interface SpeedSummary {
  atribuidos: number;
  conversados: number;
  d0: number;
  d1: number;
  d2: number;
  d3plus: number;
  nunca: number;
}

export interface BottleneckSignal {
  kind: "leads" | "conversao" | "time" | "midia" | "velocidade";
  label: string;
  /** 0-100: quanto maior, mais esse fator trava o crescimento agora */
  score: number;
  status: BottleneckStatus;
  headline: string;
  detail: string;
  action: string;
}

export interface BottleneckAnalysis {
  primary: BottleneckSignal | null;
  signals: BottleneckSignal[];
  hasData: boolean;
}

function statusFor(score: number): BottleneckStatus {
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

export function bottleneckAnalysis(
  data: DashboardData,
  today = isoToday(),
  speed?: SpeedSummary | null
): BottleneckAnalysis {
  const curStart = daysAgo(29, new Date(today));
  const prevStart = daysAgo(59, new Date(today));
  const prevEnd = daysAgo(30, new Date(today));

  const leadsCur = inRange(data.leads, (l) => l.createdAt, curStart, today).length;
  const leadsPrev = inRange(data.leads, (l) => l.createdAt, prevStart, prevEnd).length;
  const salesCur = inRange(paidSales(data.sales), (s) => s.saleDate, curStart, today).length;
  const salesPrev = inRange(paidSales(data.sales), (s) => s.saleDate, prevStart, prevEnd).length;

  // ROBUSTO a lançamento: tendência de leads pela MEDIANA diária (ignora os
  // poucos dias de pico) e conversão pela mediana de meses fechados.
  const medLeadsCur = median(dailyCounts(data.leads, (l) => l.createdAt, curStart, today)) ?? 0;
  const medLeadsPrev = median(dailyCounts(data.leads, (l) => l.createdAt, prevStart, prevEnd)) ?? 0;
  const leadsTrend = medLeadsPrev > 0 ? (medLeadsCur - medLeadsPrev) / medLeadsPrev : null;

  const closedB = lastClosedMonths(today, 6);
  const leadsByB = countByMonth(data.leads, (l) => l.createdAt);
  const salesByB = countByMonth(paidSales(data.sales), (s) => s.saleDate);
  const convPerMonth = closedB.map((m) => {
    const lm = leadsByB.get(m) ?? 0;
    const sm = salesByB.get(m) ?? 0;
    return lm > 0 ? sm / lm : null;
  });
  const convCur = median(convPerMonth.slice(0, 3).filter((x): x is number => x !== null));
  const convPrev = median(convPerMonth.slice(3, 6).filter((x): x is number => x !== null));
  const convTrend =
    convCur !== null && convPrev !== null && convPrev > 0
      ? (convCur - convPrev) / convPrev
      : null;

  const adCur = sum(inRange(data.adSpend, (a) => a.date, curStart, today).map((a) => a.amount));
  const adPrev = sum(
    inRange(data.adSpend, (a) => a.date, prevStart, prevEnd).map((a) => a.amount)
  );
  const cacCur = salesCur > 0 && adCur > 0 ? adCur / salesCur : null;
  const cacPrev = salesPrev > 0 && adPrev > 0 ? adPrev / salesPrev : null;
  const cacTrend = cacCur !== null && cacPrev !== null ? (cacCur - cacPrev) / cacPrev : null;

  // Capacidade medida sobre leads QUALIFICADOS (quentes + muito quentes), que é
  // com quem o vendedor realmente fala — não sobre o total de leads.
  const capacity = qualifiedCapacity30d(data, today);
  const signals: BottleneckSignal[] = [];

  // 1. Geração de leads (topo do funil) — só olha a TENDÊNCIA de entrada de
  // leads. A questão de capacidade do time fica no sinal "time", para não
  // gerar mensagem contraditória (ex.: "pouco lead" com leads em alta).
  {
    const drop = leadsTrend !== null ? Math.max(0, -leadsTrend) : 0;
    let score = 15;
    if (drop >= 0.25) score = 85;
    else if (drop >= 0.1) score = 55;
    const r1 = (x: number) => x.toFixed(1).replace(".", ",");
    const trendTxt =
      leadsTrend === null
        ? `Ritmo de ${r1(medLeadsCur)} leads/dia (mediana), sem base anterior para comparar`
        : `Ritmo típico de ${r1(medLeadsCur)} leads/dia agora contra ${r1(medLeadsPrev)}/dia nos 30 dias anteriores (${leadsTrend < 0 ? "queda" : "alta"} de ${fmtPct(leadsTrend)}) — mediana diária, sem distorção de pico de lançamento`;
    signals.push({
      kind: "leads",
      label: "Geração de leads",
      score,
      status: statusFor(score),
      headline:
        score >= 70
          ? "Está entrando menos lead que antes"
          : score >= 40
            ? "Entrada de leads desacelerando"
            : "Entrada de leads saudável",
      detail: trendTxt + ".",
      action:
        score >= 40
          ? "Aumente o investimento em mídia e reforce o orgânico: o topo do funil é o que está travando o resto."
          : "Mantenha o ritmo de captação atual.",
    });
  }

  // 2. Conversão (qualidade da venda)
  {
    const drop = convTrend !== null ? Math.max(0, -convTrend) : 0;
    let score = 15;
    if (drop >= 0.25) score = 90;
    else if (drop >= 0.1) score = 60;
    const convTxt =
      convCur !== null && convPrev !== null
        ? `A cada 100 leads, ${(convCur * 100).toFixed(1).replace(".", ",")} viram venda agora, contra ${(convPrev * 100).toFixed(1).replace(".", ",")} no período anterior`
        : "Ainda não há vendas e leads suficientes para medir a conversão";
    signals.push({
      kind: "conversao",
      label: "Conversão em venda",
      score,
      status: statusFor(score),
      headline:
        score >= 70
          ? "Conversão caiu: o problema é vender melhor"
          : score >= 40
            ? "Conversão dando sinais de queda"
            : "Conversão estável",
      detail:
        convTxt + (convTrend !== null && convTrend < 0 ? ` (queda de ${fmtPct(convTrend)}).` : "."),
      action:
        score >= 40
          ? "Não adianta encher o funil: revise o roteiro com o time, ouça atendimentos e ataque as objeções mais comuns."
          : "Aproveitamento dos leads está dentro do esperado.",
    });
  }

  // 3. Capacidade do time — leads QUALIFICADOS (quentes + muito quentes) vs
  // vendas de CURSO (A5E + Gigantes); ingressos do evento não contam.
  {
    const cap = capacity;
    // time ocioso: o volume de qualificados sustenta MENOS vendedores que o time tem.
    const ocioso = cap.supportedSellers !== null && cap.supportedSellers < cap.activeSellers;
    let score = 10;
    if (cap.unreliable) score = 10;
    else if (cap.verdict === "pode_contratar") score = 80;
    else if (cap.verdict === "quase") score = 45;
    else if (ocioso) score = 50;

    let headline: string;
    let action: string;
    let detail: string;
    if (cap.unreliable) {
      headline = "Capacidade não estimável (qualificação incompleta no CRM)";
      detail = `Não dá pra estimar a capacidade pelos leads qualificados: nos últimos 30 dias entraram ~${cap.qualified30} leads quentes/muito quentes, mas houve ${cap.sales30} vendas de curso — mais vendas do que leads quentes. Ou seja, boa parte das vendas não está passando pelo funil de leads quentes do CRM.`;
      action =
        "Garanta que os leads quentes sejam registrados no CRM (Unnichat) — só assim dá pra medir a capacidade real do time.";
    } else if (cap.supportedSellers === null) {
      headline = "Time dá conta do volume atual";
      detail =
        "Ainda não há leads qualificados (quentes/muito quentes) suficientes nos últimos 30 dias para estimar a capacidade do time.";
      action = "Sem necessidade de contratar agora.";
    } else {
      detail = `Nos últimos 30 dias entram ~${cap.robustMonthlyLeads} leads qualificados/mês (quentes + muito quentes, que é com quem o vendedor fala), e cada venda de curso exige ~${cap.leadsPerSale !== null ? cap.leadsPerSale.toFixed(1).replace(".", ",") : "?"}. Isso sustenta ${cap.supportedSellers} vendedor(es); o time tem ${cap.activeSellers}. Pico de ${cap.sellerMonthlyCapacity} vendas de curso/mês por vendedor.`;
      headline =
        score >= 70
          ? "Tem lead qualificado sobrando: falta gente pra atender"
          : cap.verdict === "quase"
            ? "Time perto do limite"
            : ocioso
              ? "Sobra capacidade: falta lead qualificado"
              : "Time dá conta do volume atual";
      action =
        score >= 70
          ? "Contrate (ou ative) mais um vendedor antes de investir mais em mídia — hoje há lead qualificado sendo desperdiçado."
          : cap.verdict === "quase"
            ? "Prepare a próxima contratação: no ritmo atual o time satura em breve."
            : ocioso
              ? "Não contrate agora — o time comporta mais venda do que o volume de leads qualificados permite. Foque em gerar e qualificar mais leads quentes."
              : "Sem necessidade de contratar agora.";
    }
    signals.push({
      kind: "time",
      label: "Capacidade do time",
      score,
      status: statusFor(score),
      headline,
      action,
      detail,
    });
  }

  // 4. Eficiência de mídia (CAC)
  {
    const rise = cacTrend !== null ? Math.max(0, cacTrend) : 0;
    let score = 10;
    if (rise >= 0.3) score = 70;
    else if (rise >= 0.15) score = 50;
    const detail =
      cacCur !== null && cacPrev !== null
        ? `Cada venda custou ${fmtBrl(cacCur)} em anúncios nos últimos 30 dias, contra ${fmtBrl(cacPrev)} no período anterior${cacTrend !== null && cacTrend > 0 ? ` (alta de ${fmtPct(cacTrend)})` : ""}.`
        : cacCur !== null
          ? `Cada venda custou ${fmtBrl(cacCur)} em anúncios nos últimos 30 dias (sem investimento no período anterior para comparar).`
          : "Sem dados suficientes de investimento em anúncios para calcular o custo por venda.";
    signals.push({
      kind: "midia",
      label: "Eficiência de mídia",
      score,
      status: statusFor(score),
      headline:
        score >= 70
          ? "Custo por venda disparou"
          : score >= 40
            ? "Custo por venda subindo"
            : "Mídia com custo sob controle",
      detail,
      action:
        score >= 40
          ? "Revise campanhas e criativos: o mesmo dinheiro está trazendo menos venda que antes."
          : "Eficiência de mídia dentro do esperado.",
    });
  }

  // 5. Atendimento no dia 0 = PROXY DE CAPACIDADE do time. Não é que atender
  // rápido converta mais (os dados não mostram isso); é que, quando o time NÃO
  // consegue atender no mesmo dia, é porque está saturado e acumulando fila —
  // e lead que acumula vira lead nunca conversado (que converte só ~3%).
  if (speed && speed.atribuidos > 0) {
    const d0Rate = speed.d0 / speed.atribuidos;
    const naoConvRate = speed.nunca / speed.atribuidos;
    let score = 15;
    if (d0Rate < 0.4) score = 85;
    else if (d0Rate < 0.6) score = 55;
    const r0 = Math.round(d0Rate * 100);
    const rNunca = Math.round(naoConvRate * 100);
    signals.push({
      kind: "velocidade",
      label: "Atendimento no dia 0 (capacidade)",
      score,
      status: statusFor(score),
      headline:
        score >= 70
          ? "Time saturado: a maioria dos leads quentes não é atendida no mesmo dia"
          : score >= 40
            ? "Time começando a acumular: atendimento no dia 0 caindo"
            : "Time dá conta: maioria atendida no mesmo dia",
      detail: `Só ${r0}% dos leads quentes são atendidos no mesmo dia (dia 0) — isso mede a capacidade do time, não a pressa: quando cai, é porque a fila está acumulando. Hoje ${speed.nunca} leads quentes (${rNunca}%) nunca foram conversados, e lead não conversado converte só ~3% (contra ~13% dos conversados). Lead que acumula vira lead perdido.`,
      action:
        score >= 40
          ? "Trate o dia 0 como medidor de capacidade: se está baixo, redistribua os leads entre os vendedores ou reforce o time antes que a fila vire lead morto. O lever não é responder em minutos — é não deixar lead quente sem atendimento."
          : "Capacidade saudável — o time está atendendo no mesmo dia, sem acúmulo.",
    });
  }

  signals.sort((a, b) => b.score - a.score);
  const hasData = leadsCur + leadsPrev + salesCur + salesPrev > 0;
  const primary = hasData && signals[0].score >= 40 ? signals[0] : null;
  return { primary, signals, hasData };
}
