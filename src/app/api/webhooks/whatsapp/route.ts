import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  extFromMime,
  fetchWhatsappMedia,
  getWhatsappConfig,
  sendWhatsappText,
  verifyWhatsappSignature,
} from "@/lib/whatsapp";
import { runSupportAgent, type AgentMessage, type AgentImage } from "@/lib/support-ai";
import { transcreverAudio, transcricaoConfigurada } from "@/lib/transcribe";

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

// Tipos que viram anexo (o resto vira texto ou é ignorado).
const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"] as const;

// Formatos de imagem que a API da Claude aceita. WhatsApp manda jpeg quase
// sempre; o resto entra por completude.
const VISION_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Texto legível de uma mensagem, seja qual for o tipo. Áudio e imagem não têm
// texto — mas legenda (caption) tem, e é o que o cliente escreveu junto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textoDe(msg: any): string {
  if (msg?.type === "text") return String(msg?.text?.body ?? "");
  if (msg?.type === "button") return String(msg?.button?.text ?? "");
  if (msg?.type === "interactive") {
    return String(
      msg?.interactive?.button_reply?.title ?? msg?.interactive?.list_reply?.title ?? ""
    );
  }
  const cap = msg?.[msg?.type]?.caption;
  return typeof cap === "string" ? cap : "";
}

// --- Verificação (GET) ---
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const expected = (await getWhatsappConfig()).verifyToken;

  if (mode === "subscribe" && expected && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// --- Recebimento (POST) ---
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  const sigOk = await verifyWhatsappSignature(raw, sig);

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

  const autoReply = (await getWhatsappConfig()).autoReply;

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      // Nome do contato (vem uma vez por evento, não por mensagem).
      const perfil = Array.isArray(value?.contacts) ? value.contacts[0] : null;
      const nomeContato: string | null = perfil?.profile?.name
        ? String(perfil.profile.name)
        : null;

      // Recibos de entrega/leitura das NOSSAS mensagens.
      const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
      for (const st of statuses) {
        const id = String(st?.id ?? "");
        const status = String(st?.status ?? "");
        if (!id || !status) continue;
        await supabase
          .from("support_messages")
          .update({ wa_status: status })
          .eq("wa_message_id", id);
      }

      for (const msg of messages) {
        const from = String(msg?.from ?? "");
        const waId = String(msg?.id ?? "");
        const tipo = String(msg?.type ?? "");
        if (!from || !waId || !tipo) continue;

        const text = textoDe(msg);
        const isMedia = (MEDIA_TYPES as readonly string[]).includes(tipo);
        // Sem texto e sem mídia (ex.: reaction, system) — não vira mensagem.
        if (!text && !isMedia) continue;

        // CLAIM (dedupe): ON CONFLICT DO NOTHING via upsert ignoreDuplicates.
        // Se não voltar linha, outra entrega já está cuidando — pula.
        const { data: claimed } = await supabase
          .from("support_messages")
          .upsert(
            {
              wa_phone: from,
              direction: "in",
              text: text || null,
              tipo,
              media_id: isMedia ? String(msg?.[tipo]?.id ?? "") || null : null,
              media_mime: isMedia ? String(msg?.[tipo]?.mime_type ?? "") || null : null,
              wa_message_id: waId,
              autor: "cliente",
            },
            { onConflict: "wa_message_id", ignoreDuplicates: true }
          )
          .select("id");
        if (!claimed || claimed.length === 0) continue;
        const rowId = claimed[0].id as string;

        if (nomeContato) {
          await supabase
            .from("support_conversas")
            .update({ nome: nomeContato })
            .eq("wa_phone", from)
            .is("nome", null);
        }

        // Baixa o anexo e guarda no Storage (a URL da Meta expira e exige token).
        // O que baixou aqui também alimenta a IA logo abaixo — áudio vira texto
        // por transcrição, imagem vai como imagem mesmo.
        let textoParaIA = text;
        const imagensParaIA: AgentImage[] = [];

        if (isMedia) {
          const mediaId = String(msg?.[tipo]?.id ?? "");
          if (mediaId) {
            const media = await fetchWhatsappMedia(mediaId);
            if (media.ok && media.bytes) {
              const mime = media.mime ?? "application/octet-stream";
              const path = `${from}/${waId}.${extFromMime(mime)}`;
              const up = await supabase.storage
                .from("whatsapp")
                .upload(path, media.bytes, { contentType: mime, upsert: true });
              if (!up.error) {
                await supabase
                  .from("support_messages")
                  .update({ media_path: path, media_mime: mime })
                  .eq("id", rowId);
              }

              // Áudio → texto. Metade dos clientes manda áudio; sem isso, todos
              // caíam no humano mesmo quando a pergunta era trivial.
              if (tipo === "audio" && transcricaoConfigurada()) {
                const tr = await transcreverAudio(media.bytes, mime);
                if (tr.ok && tr.texto) {
                  textoParaIA = [text, tr.texto].filter(Boolean).join("\n");
                  // Guarda junto da mensagem: quem abrir a conversa lê o áudio
                  // sem precisar dar play.
                  await supabase
                    .from("support_messages")
                    .update({ text: `🎙️ ${tr.texto}` })
                    .eq("id", rowId);
                } else {
                  await supabase.from("webhook_log").insert({
                    source: "whatsapp",
                    note: "falha ao transcrever áudio",
                    body: { waId, error: tr.error },
                  });
                }
              }

              // Imagem → vai para a IA como imagem. Print de erro e comprovante
              // são metade do suporte.
              if (tipo === "image" && VISION_MIMES.has(mime.split(";")[0].trim())) {
                imagensParaIA.push({
                  mime: mime.split(";")[0].trim(),
                  base64: Buffer.from(media.bytes).toString("base64"),
                });
              }
            } else {
              await supabase.from("webhook_log").insert({
                source: "whatsapp",
                note: "falha ao baixar mídia",
                body: { waId, error: media.error },
              });
            }
          }
        }

        if (!autoReply) continue; // modo observação: só guarda

        // Anexo que a IA não consegue interpretar (vídeo, PDF, sticker, ou áudio
        // sem transcrição configurada) continua indo direto pro humano.
        const iaEntende = !isMedia || imagensParaIA.length > 0 || textoParaIA !== text;
        if (!iaEntende) continue;

        // Conversa com a IA desligada na mão fica só com o humano.
        const { data: conversa } = await supabase
          .from("support_conversas")
          .select("ia_ativa")
          .eq("wa_phone", from)
          .maybeSingle();
        if (conversa && conversa.ia_ativa === false) continue;

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
          const result = await runSupportAgent(textoParaIA, history, [], imagensParaIA);
          // Envia em mensagens separadas, como um atendente no WhatsApp.
          for (let i = 0; i < result.messages.length; i++) {
            const part = result.messages[i];
            const sent = await sendWhatsappText(from, part);
            await supabase.from("support_messages").insert({
              wa_phone: from,
              direction: "out",
              text: part,
              tipo: "text",
              autor: "ia",
              wa_message_id: sent.id ?? null,
              // marca o caso só na última mensagem do turno
              escalated: i === result.messages.length - 1 ? result.escalated : false,
            });
            if (!sent.ok) {
              await supabase.from("webhook_log").insert({
                source: "whatsapp",
                note: "falha ao enviar resposta",
                body: { to: from, error: sent.error },
              });
              break;
            }
            // pequeno intervalo entre mensagens (efeito humano)
            if (i < result.messages.length - 1) await new Promise((r) => setTimeout(r, 600));
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
