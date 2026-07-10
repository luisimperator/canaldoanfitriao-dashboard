import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Conversas do atendimento (WhatsApp via Unnichat), com o dado que decide a
// prioridade do dia: de quem é a "bola". last_sender='contact' significa que a
// última mensagem é do LEAD — ele falou e está esperando o vendedor responder.
// Lê as funções SQL de supabase/migrations/0015_conversas_bola.sql.

export interface ConversationRow {
  contact_id: string;
  contact_name: string | null;
  seller: string | null;
  outcome: string | null;
  msg_count: number | null;
  last_at: string | null;
  email: string | null;
  phone: string | null;
  /** quem mandou a última mensagem: 'contact' (lead) | 'user' | 'platform' */
  last_sender: string | null;
}

export async function getConversationsOverview(): Promise<ConversationRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin.rpc("conversations_overview");
    if (error) return [];
    return (data ?? []) as ConversationRow[];
  } catch {
    return [];
  }
}

// Taxa de fechamento por velocidade da 1ª resposta humana, no histórico
// completo — a prova em número de que responder rápido fecha venda.
export interface ResponseStatRow {
  bucket: string;
  ord: number;
  conversas: number;
  won: number;
  lost: number;
}

export async function getResponseStats(): Promise<ResponseStatRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin.rpc("conversation_response_stats");
    if (error) return [];
    return ((data ?? []) as ResponseStatRow[]).map((r) => ({
      bucket: r.bucket,
      ord: Number(r.ord),
      conversas: Number(r.conversas),
      won: Number(r.won),
      lost: Number(r.lost),
    }));
  } catch {
    return [];
  }
}
