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

// --- Mídia ---
//
// A Meta não manda o arquivo no webhook, só um id. Buscar é em dois passos:
// pega a URL temporária pelo id e baixa com o mesmo token (a URL sozinha não
// abre — exige o Authorization).

export interface WhatsappMedia {
  ok: boolean;
  bytes?: ArrayBuffer;
  mime?: string;
  error?: string;
}

export async function fetchWhatsappMedia(mediaId: string): Promise<WhatsappMedia> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { ok: false, error: "WhatsApp não configurado." };
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meta = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok || !meta?.url) {
      return { ok: false, error: JSON.stringify(meta).slice(0, 300) };
    }
    const fileRes = await fetch(meta.url as string, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fileRes.ok) return { ok: false, error: `download ${fileRes.status}` };
    return {
      ok: true,
      bytes: await fileRes.arrayBuffer(),
      mime: String(meta.mime_type ?? fileRes.headers.get("content-type") ?? "application/octet-stream"),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro de rede" };
  }
}

// Extensão a partir do mime, pra mídia salva ter nome decente no Storage.
export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "application/pdf": "pdf",
  };
  return map[mime.split(";")[0].trim()] ?? "bin";
}
