import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Saúde REAL de cada integração: não basta a credencial estar configurada,
// olhamos se dado/evento de fato chegou ao banco. Isso evita o selo
// "Conectada" mentir (ex.: chave do Unnichat setada, mas nenhum evento
// chegando). Também devolve os últimos eventos de webhook para diagnóstico.

export interface IntegrationHealth {
  hasData: boolean;
  detail: string;
}

export interface RecentEvent {
  source: string;
  note: string | null;
  created_at: string;
}

export interface IntegrationsHealth {
  byId: Record<string, IntegrationHealth>;
  recentEvents: RecentEvent[];
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

export async function getIntegrationsHealth(): Promise<IntegrationsHealth | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const countOf = async (
    table: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    build: (q: any) => any
  ): Promise<number> => {
    const { count } = await build(
      admin.from(table).select("*", { count: "exact", head: true })
    );
    return count ?? 0;
  };

  const [mailchimp, unnichatLinked, unnichatEvents, eduzz, meta, inter, tmb, recent] =
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countOf("leads", (q: any) => q.not("mailchimp_id", "is", null)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countOf("leads", (q: any) => q.not("unnichat_id", "is", null)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countOf("webhook_log", (q: any) => q.eq("source", "unnichat")),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countOf("sales", (q: any) => q),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countOf("ad_spend", (q: any) => q),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countOf("fin_transactions", (q: any) => q),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countOf("webhook_log", (q: any) => q.eq("source", "tmb")),
      admin
        .from("webhook_log")
        .select("source, note, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const byId: Record<string, IntegrationHealth> = {
    supabase: { hasData: true, detail: "banco conectado" },
    mailchimp: {
      hasData: mailchimp > 0,
      detail: mailchimp > 0 ? `${fmt(mailchimp)} leads importados` : "nenhum lead importado ainda",
    },
    unnichat:
      unnichatLinked > 0
        ? { hasData: true, detail: `${fmt(unnichatLinked)} contatos vinculados` }
        : unnichatEvents > 0
          ? {
              hasData: false,
              detail: `${fmt(unnichatEvents)} chamadas recebidas, mas nenhuma vinculou um contato`,
            }
          : { hasData: false, detail: "nenhuma chamada recebida do Unnichat ainda" },
    eduzz: {
      hasData: eduzz > 0,
      detail: eduzz > 0 ? `${fmt(eduzz)} vendas registradas` : "nenhuma venda recebida ainda",
    },
    meta_ads: {
      hasData: meta > 0,
      detail: meta > 0 ? `${fmt(meta)} dias de gasto importados` : "nenhum gasto importado ainda",
    },
    inter: {
      hasData: inter > 0,
      detail: inter > 0 ? `${fmt(inter)} lançamentos importados` : "nenhum lançamento importado ainda",
    },
    tmb: {
      hasData: tmb > 0,
      detail: tmb > 0 ? `${fmt(tmb)} eventos recebidos` : "nenhum evento recebido ainda",
    },
  };

  return { byId, recentEvents: recent.data ?? [] };
}
