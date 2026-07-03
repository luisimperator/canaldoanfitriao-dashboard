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
  /** dias do mês com registro de gasto — base do alerta de cobertura */
  spendDays: number;
  /** true quando há dias SEM registro entre o primeiro e o último dia com
   * gasto do mês — sinal de sync fora do ar no meio da atividade (pausa real
   * de conta não dispara: ela zera do dia X em diante, sem buraco interno) */
  spendIncomplete: boolean;
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
      e = {
        month: m,
        spend: 0,
        spendMeta: 0,
        spendGoogle: 0,
        revenue: 0,
        sales: 0,
        spendDays: 0,
        spendIncomplete: false,
        roas: null,
        cac: null,
      };
      map.set(m, e);
    }
    return e;
  };

  const daysByMonth = new Map<string, Set<string>>();
  for (const a of data.adSpend) {
    const mk = monthKey(a.date);
    const e = get(mk);
    e.spend += a.amount;
    if (a.platform === "meta_ads") e.spendMeta += a.amount;
    else if (a.platform === "google_ads") e.spendGoogle += a.amount;
    const days = daysByMonth.get(mk) ?? new Set<string>();
    days.add(a.date);
    daysByMonth.set(mk, days);
  }
  for (const s of paidSales(data.sales)) {
    const e = get(monthKey(s.saleDate));
    e.revenue += s.amount;
    e.sales += 1;
  }

  const months = [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const e of months) {
    const days = daysByMonth.get(e.month);
    e.spendDays = days?.size ?? 0;
    // Buraco INTERNO no mês (dias sem registro entre o primeiro e o último dia
    // com gasto) = sync de anúncios fora do ar no meio da atividade; CAC/ROAS
    // do mês estão calculados por baixo. Conta pausada não dispara: ela zera
    // do dia X em diante, sem deixar buraco no meio.
    if (days && days.size > 0) {
      const sorted = [...days].sort();
      const first = new Date(sorted[0] + "T12:00Z").getTime();
      const last = new Date(sorted[sorted.length - 1] + "T12:00Z").getTime();
      const span = Math.round((last - first) / 86_400_000) + 1;
      e.spendIncomplete = days.size < span;
    }
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
