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

// O WhatsApp usa *negrito* com UM asterisco; markdown usa **dois**. A IA
// escreve em markdown por hábito e o cliente recebia "**Gigantes**" com os
// asteriscos na cara. Também não existe ### nem [texto](link) no WhatsApp.
function paraWhatsapp(texto: string): string {
  return texto
    .replace(/\*\*\*(.+?)\*\*\*/g, "*_$1_*")   // ***x*** -> *_x_*
    .replace(/\*\*(.+?)\*\*/g, "*$1*")         // **x**   -> *x*
    .replace(/^#{1,6}\s+/gm, "")                // ## título -> título
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1: $2"); // link markdown
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
          text: { body: paraWhatsapp(body).slice(0, 4096), preview_url: false },
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

// --- Templates (mensagem fora da janela de 24h) ---
//
// A Meta só entrega mensagem LIVRE dentro de 24h da última mensagem do cliente.
// Passou disso, o único jeito de falar com alguém é um template previamente
// aprovado por eles. Isso vale pro cliente e vale pra avisar o time interno —
// o Ivanildo também está "fora da janela" na hora que um caso escala.
//
// Aprovação costuma sair em minutos (UTILITY) e pode levar até 24h.

export interface WhatsappTemplate {
  id: string;
  name: string;
  language: string;
  /** APPROVED | PENDING | REJECTED | PAUSED | DISABLED */
  status: string;
  /** UTILITY | MARKETING | AUTHENTICATION */
  category: string;
  rejectedReason?: string | null;
  /** Texto do corpo, com os {{1}}, {{2}}… como a Meta guarda. */
  body: string;
  /** Quantos parâmetros o corpo espera. */
  params: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTemplate(t: any): WhatsappTemplate {
  const comps = Array.isArray(t?.components) ? t.components : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const corpo = comps.find((c: any) => c?.type === "BODY");
  const body = String(corpo?.text ?? "");
  const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return {
    id: String(t?.id ?? ""),
    name: String(t?.name ?? ""),
    language: String(t?.language ?? ""),
    status: String(t?.status ?? ""),
    category: String(t?.category ?? ""),
    rejectedReason: t?.rejected_reason ?? null,
    body,
    params: nums.length > 0 ? Math.max(...nums) : 0,
  };
}

async function grafo(
  caminho: string,
  init?: RequestInit
): Promise<{ ok: boolean; json: Record<string, unknown>; error?: string }> {
  const { token } = await getWhatsappConfig();
  if (!token) return { ok: false, json: {}, error: "WhatsApp não configurado." };
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${caminho}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = json?.error as { message?: string } | undefined;
      return { ok: false, json, error: err?.message ?? JSON.stringify(json).slice(0, 400) };
    }
    return { ok: true, json };
  } catch (e) {
    return { ok: false, json: {}, error: e instanceof Error ? e.message : "erro de rede" };
  }
}

export async function listWhatsappTemplates(): Promise<{
  ok: boolean;
  templates: WhatsappTemplate[];
  error?: string;
}> {
  const { wabaId } = await getWhatsappConfig();
  if (!wabaId) return { ok: false, templates: [], error: "WABA ID não configurado." };
  const r = await grafo(
    `${wabaId}/message_templates?fields=id,name,status,category,language,components,rejected_reason&limit=100`
  );
  if (!r.ok) return { ok: false, templates: [], error: r.error };
  const data = Array.isArray(r.json?.data) ? r.json.data : [];
  return { ok: true, templates: data.map(parseTemplate) };
}

export interface NovoTemplate {
  /** minúsculas, números e _ (a Meta rejeita o resto) */
  name: string;
  category: "UTILITY" | "MARKETING";
  language: string;
  /** corpo com {{1}}, {{2}}… na ordem */
  body: string;
  footer?: string;
  /** exemplo de cada parâmetro — a Meta EXIGE pra aprovar */
  exemplos?: string[];
}

export async function createWhatsappTemplate(
  t: NovoTemplate
): Promise<{ ok: boolean; id?: string; status?: string; error?: string }> {
  const { wabaId } = await getWhatsappConfig();
  if (!wabaId) return { ok: false, error: "WABA ID não configurado." };

  const nums = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const qtd = nums.length > 0 ? Math.max(...nums) : 0;
  // Sem example a Meta rejeita na hora ("missing example"). Se o operador não
  // preencheu, mandamos um placeholder — serve só pra revisão humana deles.
  const exemplos =
    qtd > 0
      ? Array.from({ length: qtd }, (_, i) => t.exemplos?.[i]?.trim() || `exemplo ${i + 1}`)
      : [];

  const components: Record<string, unknown>[] = [
    {
      type: "BODY",
      text: t.body,
      ...(qtd > 0 ? { example: { body_text: [exemplos] } } : {}),
    },
  ];
  if (t.footer?.trim()) components.push({ type: "FOOTER", text: t.footer.trim() });

  const r = await grafo(`${wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name: t.name,
      category: t.category,
      language: t.language,
      components,
    }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, id: String(r.json?.id ?? ""), status: String(r.json?.status ?? "PENDING") };
}

export async function deleteWhatsappTemplate(
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const { wabaId } = await getWhatsappConfig();
  if (!wabaId) return { ok: false, error: "WABA ID não configurado." };
  const r = await grafo(`${wabaId}/message_templates?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/**
 * Parâmetro de template não aceita quebra de linha, tab, nem 4+ espaços
 * seguidos — a Meta devolve erro 132000 e a mensagem não sai. O resumo que a
 * IA escreve tem quebra de linha o tempo todo, então tudo passa por aqui.
 */
export function paramSeguro(v: string, max = 700): string {
  return (v || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max) || "-";
}

export async function sendWhatsappTemplate(
  to: string,
  name: string,
  language: string,
  params: string[] = []
): Promise<SendResult> {
  const { token, phoneNumberId: phoneId } = await getWhatsappConfig();
  if (!token || !phoneId) return { ok: false, error: "WhatsApp não configurado." };

  const components =
    params.length > 0
      ? [
          {
            type: "body",
            parameters: params.map((p) => ({ type: "text", text: paramSeguro(p) })),
          },
        ]
      : [];

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name, language: { code: language }, components },
        }),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: JSON.stringify(json).slice(0, 500) };
    return { ok: true, id: json?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro de rede" };
  }
}
