import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Compradores de curso do mês × temperatura do lead × vendedor (RPC
// buyer_temp_month). Responde "quem compra: quente, frio ou gente de fora do
// funil?" — e por vendedor, vira ferramenta de coaching do time.

export interface BuyerTempRow {
  vendedor: string | null;
  perfil: string;
  compradores: number;
}

// Ordem de exibição: das temperaturas pro "fora do radar".
export const PERFIL_ORDER = [
  "muito quente",
  "quente A5E/Gig",
  "quente",
  "morno",
  "frio",
  "muito frio",
  "sem temperatura",
  "fora do CRM",
  "nem era lead",
];

export async function getBuyerTempMonth(
  start: string,
  end: string
): Promise<BuyerTempRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin.rpc("buyer_temp_month", {
      p_start: start,
      p_end: end,
    });
    if (error) return [];
    return ((data ?? []) as BuyerTempRow[]).map((r) => ({
      vendedor: r.vendedor,
      perfil: r.perfil,
      compradores: Number(r.compradores),
    }));
  } catch {
    return [];
  }
}
