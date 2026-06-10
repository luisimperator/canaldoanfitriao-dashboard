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

  // Capacidade: melhor mês de um vendedor nos últimos 3 meses completos
  const currentMonth = monthKey(today);
  const perSellerMonth = new Map<string, number>();
  for (const s of paidSales(data.sales)) {
    const mk = monthKey(s.saleDate);
    if (mk === currentMonth) continue; // mês corrente está incompleto
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
