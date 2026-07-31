// Integração com o WhatsApp Cloud API da Meta (Fase 3).
//
// Envio de mensagens via Graph API e verificação da assinatura dos webhooks.
// As credenciais vêm de DUAS fontes, nesta ordem:
//   1. variáveis de ambiente (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
//      WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN)
//   2. Vault do Supabase, pela RPC whatsapp_config() — permite ligar e trocar
//      o número sem abrir a Vercel e sem deploy
//
// WHATSAPP_GRAPH_VERSION é opcional (default v21.0).

import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";

export interface WhatsappConfig {
  token: string | null;
  phoneNumberId: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  wabaId: string | null;
  autoReply: boolean;
}

// Cache curto: o webhook recebe mensagens em rajada e não faz sentido ir ao
// banco em cada uma.
let cache: { at: number; cfg: WhatsappConfig } | null = null;
const CACHE_MS = 60_000;

export async function getWhatsappConfig(): Promise<WhatsappConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.cfg;

  const cfg: WhatsappConfig = {
    token: process.env.WHATSAPP_TOKEN || null,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    appSecret: process.env.WHATSAPP_APP_SECRET || null,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || null,
    wabaId: process.env.WHATSAPP_WABA_ID || null,
    autoReply: process.env.WHATSAPP_AUTO_REPLY === "true",
  };

  // Falta algo no ambiente? Completa com o Vault.
  if (!cfg.token || !cfg.phoneNumberId || !cfg.appSecret || !cfg.verifyToken) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        const { data } = await admin.rpc("whatsapp_config");
        const v = (data ?? {}) as Record<string, string | null>;
        cfg.token = cfg.token || v.token || null;
        cfg.phoneNumberId = cfg.phoneNumberId || v.phone_number_id || null;
        cfg.appSecret = cfg.appSecret || v.app_secret || null;
        cfg.verifyToken = cfg.verifyToken || v.verify_token || null;
        cfg.wabaId = cfg.wabaId || v.waba_id || null;
        if (process.env.WHATSAPP_AUTO_REPLY === undefined) {
          cfg.autoReply = v.auto_reply === "true";
        }
      } catch {
        // sem banco/RPC: segue com o que veio do ambiente
      }
    }
  }

  cache = { at: Date.now(), cfg };
  return cfg;
}

/** Esquece o cache (usar depois de gravar credencial nova). */
export function resetWhatsappConfigCache(): void {
  cache = null;
}

export async function whatsappConfigured(): Promise<boolean> {
  const cfg = await getWhatsappConfig();
  return Boolean(cfg.token && cfg.phoneNumberId);
}

// Verifica a assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o app
// secret). Sem WHATSAPP_APP_SECRET configurado, não dá pra verificar — devolve
// null (quem chama decide; em produção, configure o app secret).
export async function verifyWhatsappSignature(
  rawBody: string,
  signature: string | null
): Promise<boolean | null> {
  const secret = (await getWhatsappConfig()).appSecret;
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
  const { token, phoneNumberId: phoneId } = await getWhatsappConfig();
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
  const { token } = await getWhatsappConfig();
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
