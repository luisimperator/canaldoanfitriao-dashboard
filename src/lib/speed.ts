import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { SpeedSummary } from "@/lib/metrics";

// Velocidade de atendimento (speed-to-lead) por vendedor + total.
// Lê a função SQL seller_speed_to_lead (agrega a tabela conversations no banco).

export interface SpeedRow {
  seller: string;
  atribuidos: number;
  conversados: number;
  d0: number;
  d1: number;
  d2: number;
  d3plus: number;
  nunca: number;
}

export interface SpeedData {
  rows: SpeedRow[];
  total: SpeedSummary;
}

const EMPTY: SpeedSummary = {
  atribuidos: 0,
  conversados: 0,
  d0: 0,
  d1: 0,
  d2: 0,
  d3plus: 0,
  nunca: 0,
};

// Atendimento no dia 0 por carga do dia (calmo/médio/pico). Se o d0 só cai no
// pico, o gargalo é gente; se cai no dia calmo, é processo — a distinção que
// decide se contratar resolve alguma coisa.
export interface D0LoadRow {
  bucket: "calmo" | "medio" | "pico";
  dias: number;
  leads: number;
  d0: number;
  nunca: number;
}

export async function getD0ByLoad(days = 90): Promise<D0LoadRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin.rpc("d0_by_day_load", { p_days: days });
    if (error) return [];
    return ((data ?? []) as D0LoadRow[]).map((r) => ({
      bucket: r.bucket,
      dias: Number(r.dias),
      leads: Number(r.leads),
      d0: Number(r.d0),
      nunca: Number(r.nunca),
    }));
  } catch {
    return [];
  }
}

export async function getSpeedToLead(days = 90): Promise<SpeedData> {
  const admin = getSupabaseAdmin();
  if (!admin) return { rows: [], total: { ...EMPTY } };
  try {
    const { data, error } = await admin.rpc("seller_speed_to_lead", { p_days: days });
    if (error) return { rows: [], total: { ...EMPTY } };
    const rows: SpeedRow[] = (data ?? []).map((r: SpeedRow) => ({
      seller: r.seller,
      atribuidos: Number(r.atribuidos),
      conversados: Number(r.conversados),
      d0: Number(r.d0),
      d1: Number(r.d1),
      d2: Number(r.d2),
      d3plus: Number(r.d3plus),
      nunca: Number(r.nunca),
    }));
    const total = rows.reduce<SpeedSummary>(
      (a, r) => ({
        atribuidos: a.atribuidos + r.atribuidos,
        conversados: a.conversados + r.conversados,
        d0: a.d0 + r.d0,
        d1: a.d1 + r.d1,
        d2: a.d2 + r.d2,
        d3plus: a.d3plus + r.d3plus,
        nunca: a.nunca + r.nunca,
      }),
      { ...EMPTY }
    );
    return { rows, total };
  } catch {
    return { rows: [], total: { ...EMPTY } };
  }
}
