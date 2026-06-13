// Cálculos das métricas do dashboard: vendas por vendedor, leads por venda,
// ritmo diário de leads e análise de capacidade do time de vendas.

import type { DashboardData, Lead, Sale, Seller } from "./types";

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function daysAgo(n: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
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
  /** leads necessários para fechar 1 venda (média 30d) */
  leadsPerSale: number | null;
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

export function capacityAnalysis(data: DashboardData, today = isoToday()): CapacityAnalysis {
  const start30 = daysAgo(29, new Date(today));
  const leads30d = inRange(data.leads, (l) => l.createdAt, start30, today).length;
  const sales30dArr = inRange(paidSales(data.sales), (s) => s.saleDate, start30, today);
  const sales30d = sales30dArr.length;
  const leadsPerSale = sales30d > 0 ? leads30d / sales30d : null;

  // Capacidade: melhor mês de um vendedor ATIVO nos últimos 3 meses completos.
  // Vendas sem vendedor (anúncio/lançamento) não contam — senão esse balde
  // gigante vira um "super-vendedor" e distorce toda a análise.
  const currentMonth = monthKey(today);
  const activeSellerIds = new Set(
    data.sellers.filter((s) => s.isActive).map((s) => s.id)
  );
  const perSellerMonth = new Map<string, number>();
  for (const s of paidSales(data.sales)) {
    const mk = monthKey(s.saleDate);
    if (mk === currentMonth) continue; // mês corrente está incompleto
    if (!s.sellerId || !activeSellerIds.has(s.sellerId)) continue;
    const key = `${s.sellerId}|${mk}`;
    perSellerMonth.set(key, (perSellerMonth.get(key) ?? 0) + 1);
  }
  const months = [...new Set([...perSellerMonth.keys()].map((k) => k.split("|")[1]))]
    .sort()
    .slice(-3);
  const sellerMonthlyCapacity = Math.max(
    0,
    ...[...perSellerMonth.entries()]
      .filter(([k]) => months.includes(k.split("|")[1]))
      .map(([, v]) => v)
  );

  const activeSellers = data.sellers.filter((s) => s.isActive).length;
  const leadsNeededPerSeller =
    leadsPerSale !== null && sellerMonthlyCapacity > 0
      ? leadsPerSale * sellerMonthlyCapacity
      : null;
  const supportedSellers =
    leadsNeededPerSeller && leadsNeededPerSeller > 0
      ? Math.floor(leads30d / leadsNeededPerSeller)
      : null;
  const leadsGapForNextSeller =
    leadsNeededPerSeller !== null
      ? Math.ceil(leadsNeededPerSeller * (activeSellers + 1) - leads30d)
      : null;

  let verdict: CapacityAnalysis["verdict"] = "sem_dados";
  if (supportedSellers !== null && leadsGapForNextSeller !== null) {
    if (supportedSellers >= activeSellers + 1) verdict = "pode_contratar";
    else if (leadsGapForNextSeller <= leads30d * 0.15) verdict = "quase";
    else verdict = "falta_lead";
  }

  return {
    leads30d,
    sales30d,
    leadsPerSale,
    sellerMonthlyCapacity,
    leadsNeededPerSeller,
    activeSellers,
    supportedSellers,
    leadsGapForNextSeller,
    verdict,
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

export interface BottleneckSignal {
  kind: "leads" | "conversao" | "time" | "midia";
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
  today = isoToday()
): BottleneckAnalysis {
  const curStart = daysAgo(29, new Date(today));
  const prevStart = daysAgo(59, new Date(today));
  const prevEnd = daysAgo(30, new Date(today));

  const leadsCur = inRange(data.leads, (l) => l.createdAt, curStart, today).length;
  const leadsPrev = inRange(data.leads, (l) => l.createdAt, prevStart, prevEnd).length;
  const salesCur = inRange(paidSales(data.sales), (s) => s.saleDate, curStart, today).length;
  const salesPrev = inRange(paidSales(data.sales), (s) => s.saleDate, prevStart, prevEnd).length;

  const leadsTrend = leadsPrev > 0 ? (leadsCur - leadsPrev) / leadsPrev : null;
  const convCur = leadsCur > 0 ? salesCur / leadsCur : null;
  const convPrev = leadsPrev > 0 ? salesPrev / leadsPrev : null;
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

  const capacity = capacityAnalysis(data, today);
  const signals: BottleneckSignal[] = [];

  // 1. Geração de leads (topo do funil) — só olha a TENDÊNCIA de entrada de
  // leads. A questão de capacidade do time fica no sinal "time", para não
  // gerar mensagem contraditória (ex.: "pouco lead" com leads em alta).
  {
    const drop = leadsTrend !== null ? Math.max(0, -leadsTrend) : 0;
    let score = 15;
    if (drop >= 0.25) score = 85;
    else if (drop >= 0.1) score = 55;
    const trendTxt =
      leadsTrend === null
        ? `${leadsCur} leads nos últimos 30 dias (sem base de comparação anterior)`
        : leadsTrend < 0
          ? `${leadsCur} leads nos últimos 30 dias contra ${leadsPrev} nos 30 anteriores (queda de ${fmtPct(leadsTrend)})`
          : `${leadsCur} leads nos últimos 30 dias contra ${leadsPrev} nos 30 anteriores (alta de ${fmtPct(leadsTrend)})`;
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

  // 3. Capacidade do time
  {
    let score = 10;
    if (capacity.verdict === "pode_contratar") score = 80;
    else if (capacity.verdict === "quase") score = 45;
    const detail =
      capacity.supportedSellers !== null
        ? `O volume atual de leads sustenta ${capacity.supportedSellers} vendedor(es) e o time tem ${capacity.activeSellers}. O vendedor mais produtivo fecha até ${capacity.sellerMonthlyCapacity} vendas/mês.`
        : "Ainda não há histórico suficiente para estimar a capacidade do time.";
    signals.push({
      kind: "time",
      label: "Capacidade do time",
      score,
      status: statusFor(score),
      headline:
        score >= 70
          ? "Tem lead sobrando: falta gente pra atender"
          : score >= 40
            ? "Time perto do limite"
            : "Time dá conta do volume atual",
      detail,
      action:
        score >= 70
          ? "Contrate (ou ative) mais um vendedor antes de investir mais em mídia — hoje há lead sendo desperdiçado."
          : score >= 40
            ? "Prepare a próxima contratação: no ritmo atual o time satura em breve."
            : "Sem necessidade de contratar agora.",
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

  signals.sort((a, b) => b.score - a.score);
  const hasData = leadsCur + leadsPrev + salesCur + salesPrev > 0;
  const primary = hasData && signals[0].score >= 40 ? signals[0] : null;
  return { primary, signals, hasData };
}
