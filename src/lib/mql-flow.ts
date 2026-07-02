import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Fluxo de MQL: quantos contatos NOVOS viraram MQL por dia. MQL = recebeu uma
// das tags lead-a5e / lead-gigantes / lead-quente / lead-muito-quente, contado
// no dia em que a TAG chegou (RPC mql_new_daily sobre leads.mql_at) — não pela
// criação do lead nem pela atribuição a vendedor. É o número que responde
// "tem MQL pra mais um vendedor?".
//
// Honestidade embutida: o histórico de eventos começa quando o webhook do
// Unnichat entrou no ar. `historySince`/`historyDays` dizem quanto lastro
// existe; janelas maiores que o lastro são reportadas com o que há.

export interface MqlWindow {
  days: number; // janela pedida (7/30/90)
  effectiveDays: number; // dias realmente cobertos pelo histórico
  total: number;
  perDay: number;
  perBusinessDay: number;
}

export interface MqlFlow {
  historySince: string | null; // primeiro dia com evento de atribuição
  historyDays: number;
  windows: MqlWindow[]; // 7 / 30 / 90
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function businessDaysBetween(startIso: string, endIso: string): number {
  let n = 0;
  const d = new Date(startIso + "T12:00:00Z");
  const end = new Date(endIso + "T12:00:00Z");
  while (d <= end) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export async function getMqlFlow(): Promise<MqlFlow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.rpc("mql_new_daily", { p_days: 90 });
    if (error || !data) return null;
    const daily: { day: string; mql: number }[] = (data as { day: string; mql: number }[]).map(
      (r) => ({ day: String(r.day).slice(0, 10), mql: Number(r.mql) })
    );
    if (daily.length === 0) return { historySince: null, historyDays: 0, windows: [] };

    const today = isoToday();
    const historySince = daily[0].day;
    const msDay = 86_400_000;
    const daysBetween = (a: string, b: string) =>
      Math.round((Date.parse(b + "T12:00Z") - Date.parse(a + "T12:00Z")) / msDay) + 1;
    const historyDays = daysBetween(historySince, today);

    const windows: MqlWindow[] = [7, 30, 90].map((days) => {
      const startMs = Date.parse(today + "T12:00Z") - (days - 1) * msDay;
      const start = new Date(startMs).toISOString().slice(0, 10);
      // a janela só vale a partir de quando existe histórico
      const effStart = start > historySince ? start : historySince;
      const effectiveDays = Math.min(days, daysBetween(effStart, today));
      const total = daily.filter((d) => d.day >= effStart).reduce((s, d) => s + d.mql, 0);
      const biz = Math.max(1, businessDaysBetween(effStart, today));
      return {
        days,
        effectiveDays,
        total,
        perDay: total / Math.max(1, effectiveDays),
        perBusinessDay: total / biz,
      };
    });

    return { historySince, historyDays, windows };
  } catch {
    return null;
  }
}
