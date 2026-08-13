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

// --- Templates aprovados pela Meta ---
//
// Fora da janela de 24h a Meta só entrega mensagem iniciada por template
// aprovado. Sem isso, uma conversa que passou do prazo fica sem saída nenhuma
// pelo painel — era o caso até aqui: o aviso dizia "use um template" e não
// existia como usar.
//
// Listar exige o WABA id (não o phone number id). Se faltar, o erro diz isso em
// vez de devolver lista vazia e parecer que não há template cadastrado.

export interface TemplateVar {
  /** Índice do {{n}} no corpo, começando em 1. */
  indice: number;
}

export interface WhatsappTemplate {
  name: string;
  language: string;
  category: string | null;
  /** Texto do corpo, ainda com os {{n}}. */
  body: string;
  header: string | null;
  footer: string | null;
  /** Quantos {{n}} distintos o corpo tem. */
  variaveis: number;
}

interface MetaComponent {
  type?: string;
  format?: string;
  text?: string;
}

/** Quantos {{n}} distintos existem no texto. */
export function contarVariaveis(texto: string): number {
  const achados = new Set<number>();
  for (const m of texto.matchAll(/\{\{(\d+)\}\}/g)) achados.add(Number(m[1]));
  return achados.size;
}

/** Troca {{1}}, {{2}}… pelos valores, na ordem. */
export function preencherTemplate(texto: string, valores: string[]): string {
  return texto.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] ?? `{{${n}}}`);
}

export async function listWhatsappTemplates(): Promise<{
  ok: boolean;
  templates?: WhatsappTemplate[];
  error?: string;
}> {
  const { token, wabaId } = await getWhatsappConfig();
  if (!token) return { ok: false, error: "WhatsApp não configurado." };
  if (!wabaId) {
    return {
      ok: false,
      error:
        "Falta o WABA id (WHATSAPP_WABA_ID ou waba_id no Vault) — é ele que lista os templates, não o phone number id.",
    };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?limit=100&fields=name,language,status,category,components`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: JSON.stringify(json).slice(0, 500) };

    const templates: WhatsappTemplate[] = [];
    for (const t of (json?.data ?? []) as Record<string, unknown>[]) {
      if (String(t.status) !== "APPROVED") continue; // rejeitado/pendente não entrega
      const comps = (t.components ?? []) as MetaComponent[];
      const body = comps.find((c) => c.type === "BODY")?.text ?? "";
      if (!body) continue;
      const headerComp = comps.find((c) => c.type === "HEADER");
      templates.push({
        name: String(t.name),
        language: String(t.language),
        category: t.category ? String(t.category) : null,
        body,
        // Só header de texto dá pra pré-visualizar; imagem/vídeo exigem mídia.
        header: headerComp?.format === "TEXT" ? (headerComp.text ?? null) : null,
        footer: comps.find((c) => c.type === "FOOTER")?.text ?? null,
        variaveis: contarVariaveis(body),
      });
    }
    templates.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, templates };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro de rede" };
  }
}

// Envia um template aprovado. Só preenche variáveis do BODY — header com mídia
// e botões dinâmicos não passam por aqui.
export async function sendWhatsappTemplate(
  to: string,
  name: string,
  language: string,
  valores: string[] = []
): Promise<SendResult> {
  const { token, phoneNumberId: phoneId } = await getWhatsappConfig();
  if (!token || !phoneId) return { ok: false, error: "WhatsApp não configurado." };

  const components =
    valores.length > 0
      ? [
          {
            type: "body",
            parameters: valores.map((v) => ({ type: "text", text: v })),
          },
        ]
      : [];

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
          type: "template",
          template: {
            name,
            language: { code: language },
            ...(components.length > 0 ? { components } : {}),
          },
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
