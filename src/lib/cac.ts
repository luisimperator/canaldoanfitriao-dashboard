// CAC e ROAS por mês: cruza investimento em tráfego (ad_spend, Meta+Google)
// com faturamento e vendas (Eduzz). São métricas BLENDED (faturamento total ÷
// investimento), não atribuídas por clique — é o jeito mais honesto com os
// dados que temos, e o que importa pra decisão de quanto investir.

import type { DashboardData } from "./types";
import { monthKey, paidSales } from "./metrics";

export interface MonthEfficiency {
  month: string; // YYYY-MM
  spend: number;
  spendMeta: number;
  spendGoogle: number;
  revenue: number;
  sales: number;
  /** faturamento ÷ investimento (retorno sobre o gasto) */
  roas: number | null;
  /** investimento ÷ vendas (custo por venda) */
  cac: number | null;
}

export function monthlyAdEfficiency(data: DashboardData): MonthEfficiency[] {
  const map = new Map<string, MonthEfficiency>();
  const get = (m: string): MonthEfficiency => {
    let e = map.get(m);
    if (!e) {
      e = { month: m, spend: 0, spendMeta: 0, spendGoogle: 0, revenue: 0, sales: 0, roas: null, cac: null };
      map.set(m, e);
    }
    return e;
  };

  for (const a of data.adSpend) {
    const e = get(monthKey(a.date));
    e.spend += a.amount;
    if (a.platform === "meta_ads") e.spendMeta += a.amount;
    else if (a.platform === "google_ads") e.spendGoogle += a.amount;
  }
  for (const s of paidSales(data.sales)) {
    const e = get(monthKey(s.saleDate));
    e.revenue += s.amount;
    e.sales += 1;
  }

  const months = [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const e of months) {
    e.roas = e.spend > 0 ? e.revenue / e.spend : null;
    e.cac = e.sales > 0 ? e.spend / e.sales : null;
  }
  return months;
}

// Mantém só os meses que têm investimento OU venda, e corta para os últimos N
// (null = tudo). Meses sem nenhum dos dois não interessam pra eficiência.
export function lastMonths(rows: MonthEfficiency[], n: number | null): MonthEfficiency[] {
  const withData = rows.filter((r) => r.spend > 0 || r.sales > 0);
  return n ? withData.slice(-n) : withData;
}
