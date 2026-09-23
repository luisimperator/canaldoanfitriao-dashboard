import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getWhatsappConfig } from "@/lib/whatsapp";

// Saúde REAL de cada integração: não basta a credencial estar configurada,
// olhamos se dado/evento de fato chegou ao banco. Isso evita o selo
// "Conectada" mentir (ex.: chave do Unnichat setada, mas nenhum evento
// chegando). Também devolve os últimos eventos de webhook para diagnóstico.

export interface IntegrationHealth {
  hasData: boolean;
  detail: string;
  /** Falha ativa que precisa de gente (ex.: token recusado pela Meta). */
  alert?: boolean;
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

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";

// WhatsApp: credencial "configurada" não diz nada — o token morre e o webhook
// continua recebendo normalmente; só o ENVIO falha. Então pergunta pra Meta
// ao vivo (mesma chamada do cron whatsapp-health) e conta as falhas de envio
// das últimas 24h, que é o sintoma que o cliente sente.
async function whatsappHealth(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>
): Promise<IntegrationHealth> {
  const cfg = await getWhatsappConfig();
  if (!cfg.token || !cfg.phoneNumberId) {
    return {
      hasData: false,
      alert: true,
      detail: "credencial ausente no Vault (whatsapp_token / whatsapp_phone_number_id)",
    };
  }

  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: falhas } = await admin
    .from("webhook_log")
    .select("*", { count: "exact", head: true })
    .eq("source", "whatsapp")
    .eq("note", "falha ao enviar resposta")
    .gte("created_at", desde);

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${cfg.token}` }, cache: "no-store" }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = json?.error?.code ?? res.status;
      const msg = json?.error?.message ?? "sem detalhe";
      return {
        hasData: false,
        alert: true,
        detail: `Meta recusou o token (${code}: ${msg}) — a Lia não consegue responder. Gere um token de System User (expiração: nunca) e grave no Vault como whatsapp_token.`,
      };
    }
    const base = `token ok · ${json?.display_phone_number ?? cfg.phoneNumberId} · qualidade ${json?.quality_rating ?? "?"}`;
    if ((falhas ?? 0) > 0) {
      return {
        hasData: true,
        alert: true,
        detail: `${base} · ${fmt(falhas ?? 0)} envio(s) falharam nas últimas 24h — ver eventos abaixo`,
      };
    }
    return { hasData: true, detail: base };
  } catch (e) {
    return {
      hasData: false,
      alert: true,
      detail: `não consegui falar com a Meta: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

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

  const [mailchimp, unnichatLinked, unnichatEvents, eduzz, meta, inter, tmb, recent, whatsapp] =
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
      whatsappHealth(admin),
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
    whatsapp,
  };

  return { byId, recentEvents: recent.data ?? [] };
}
