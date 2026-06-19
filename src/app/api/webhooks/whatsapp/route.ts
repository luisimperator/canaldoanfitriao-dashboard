import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendWhatsappText, verifyWhatsappSignature } from "@/lib/whatsapp";
import { runSupportAgent, type AgentMessage } from "@/lib/support-ai";

// Webhook do WhatsApp Cloud API (Meta) — Fase 3 do Suporte.
//
// GET  — handshake de verificação da Meta (hub.verify_token).
// POST — recebe mensagens, roda a IA e responde pelo WhatsApp.
//
// Segurança: a resposta automática só acontece com WHATSAPP_AUTO_REPLY=true.
// Sem isso, o webhook só registra/guarda as mensagens (modo observação), pra
// você validar a conexão antes de soltar a IA falando com clientes reais.
//
// Configure no painel da Meta (WhatsApp → Configuration → Webhook):
//   Callback URL: https://SEU_DOMINIO/api/webhooks/whatsapp
//   Verify token: o mesmo valor de WHATSAPP_VERIFY_TOKEN
//   Campos: assine "messages"

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a IA pode levar alguns segundos (hobby da Vercel limita a 60)

const HISTORY_LIMIT = 40;

// --- Verificação (GET) ---
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// --- Recebimento (POST) ---
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  const sigOk = verifyWhatsappSignature(raw, sig);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  const supabase = getSupabaseAdmin();

  // CAIXA-PRETA: registra toda requisição recebida.
  if (supabase) {
    await supabase.from("webhook_log").insert({
      source: "whatsapp",
      note:
        sigOk === false
          ? "assinatura inválida"
          : sigOk === null
            ? "sem app secret (não verificado)"
            : "evento",
      body: body ?? (raw ? { _raw: raw.slice(0, 2000) } : null),
    });
  }

  // Assinatura presente e inválida = não veio da Meta.
  if (sigOk === false) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }
  if (!supabase) {
    return NextResponse.json({ ok: true, note: "sem supabase" });
  }

  const autoReply = process.env.WHATSAPP_AUTO_REPLY === "true";

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      for (const msg of messages) {
        if (msg?.type !== "text" || !msg?.text?.body) continue;
        const from = String(msg.from ?? "");
        const waId = String(msg.id ?? "");
        const text = String(msg.text.body ?? "");
        if (!from || !waId || !text) continue;

        // CLAIM (dedupe): ON CONFLICT DO NOTHING via upsert ignoreDuplicates.
        // Se não voltar linha, outra entrega já está cuidando — pula.
        const { data: claimed } = await supabase
          .from("support_messages")
          .upsert(
            { wa_phone: from, direction: "in", text, wa_message_id: waId },
            { onConflict: "wa_message_id", ignoreDuplicates: true }
          )
          .select("id");
        if (!claimed || claimed.length === 0) continue;

        if (!autoReply) continue; // modo observação: só guarda, não responde

        // Histórico da conversa (mensagens anteriores deste número).
        const { data: prior } = await supabase
          .from("support_messages")
          .select("direction,text,wa_message_id,created_at")
          .eq("wa_phone", from)
          .order("created_at", { ascending: true })
          .limit(HISTORY_LIMIT);
        const history: AgentMessage[] = (prior ?? [])
          .filter((m) => m.wa_message_id !== waId && m.text)
          .map((m) => ({
            role: m.direction === "in" ? "user" : "assistant",
            content: String(m.text),
          }));

        try {
          const result = await runSupportAgent(text, history);
          const sent = await sendWhatsappText(from, result.reply);
          await supabase.from("support_messages").insert({
            wa_phone: from,
            direction: "out",
            text: result.reply,
            escalated: result.escalated,
          });
          if (!sent.ok) {
            await supabase.from("webhook_log").insert({
              source: "whatsapp",
              note: "falha ao enviar resposta",
              body: { to: from, error: sent.error },
            });
          }
        } catch (e) {
          await supabase.from("webhook_log").insert({
            source: "whatsapp",
            note: "erro ao processar mensagem",
            body: { to: from, error: e instanceof Error ? e.message : String(e) },
          });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
