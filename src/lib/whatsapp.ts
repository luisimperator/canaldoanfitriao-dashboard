// Integração com o WhatsApp Cloud API da Meta (Fase 3).
//
// Envio de mensagens via Graph API e verificação da assinatura dos webhooks.
// Tudo configurado por variáveis de ambiente (segredos ficam só no servidor):
//   WHATSAPP_TOKEN            token permanente (System User) — secreto
//   WHATSAPP_PHONE_NUMBER_ID  id do número (NÃO é o WABA id) — para enviar
//   WHATSAPP_APP_SECRET       app secret — verifica a assinatura do webhook
//   WHATSAPP_VERIFY_TOKEN     string que você escolhe — handshake do webhook
//   WHATSAPP_GRAPH_VERSION    opcional (default v21.0)

import crypto from "crypto";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

// Verifica a assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o app
// secret). Sem WHATSAPP_APP_SECRET configurado, não dá pra verificar — devolve
// null (quem chama decide; em produção, configure o app secret).
export function verifyWhatsappSignature(
  rawBody: string,
  signature: string | null
): boolean | null {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return null;
  if (!signature) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Link "clique para conversar" (wa.me) a partir do telefone salvo no lead/
// conversa. Unnichat e Mailchimp gravam o número em formatos variados: com
// máscara, com ou sem o DDI 55 — aqui tudo vira o formato que o wa.me aceita.
export function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return null;
  // Número brasileiro sem DDI (DDD + 8-9 dígitos) ganha o 55 na frente.
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  // Fora da faixa E.164 (país + número) não dá para montar link confiável.
  if (digits.length < 12 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

// Envia uma mensagem de texto simples para um número (E.164 sem o '+').
export async function sendWhatsappText(to: string, body: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: "WhatsApp não configurado." };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: body.slice(0, 4096), preview_url: false },
        }),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: JSON.stringify(json).slice(0, 500) };
    }
    return { ok: true, id: json?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro de rede" };
  }
}
