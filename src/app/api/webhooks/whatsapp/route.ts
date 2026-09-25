import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  extFromMime,
  fetchWhatsappMedia,
  getWhatsappConfig,
  verifyWhatsappSignature,
} from "@/lib/whatsapp";
import { responderConversa } from "@/lib/support-responder";
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

// Tipos que viram anexo (o resto vira texto ou é ignorado).
const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"] as const;

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

  // Assinatura inválida, ausente, ou impossível de verificar em produção (sem
  // app secret) = não veio da Meta. Registra a tentativa SEM o corpo — não
  // guardamos payload de quem não se autenticou.
  if (sigOk === false) {
    if (supabase) {
      await supabase.from("webhook_log").insert({
        source: "whatsapp",
        note: "assinatura inválida ou não verificável — rejeitada",
      });
    }
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  // CAIXA-PRETA: registra toda requisição aceita. sigOk === null só acontece
  // fora de produção (sem app secret configurado).
  if (supabase) {
    await supabase.from("webhook_log").insert({
      source: "whatsapp",
      note: sigOk === null ? "sem app secret (não verificado; só fora de produção)" : "evento",
      body: body ?? (raw ? { _raw: raw.slice(0, 2000) } : null),
    });
  }
  if (!supabase) {
    return NextResponse.json({ ok: true, note: "sem supabase" });
  }

  const autoReply = (await getWhatsappConfig()).autoReply;

  const conversasNovas = new Map<string, string | null>();
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
        // Áudio vira texto por transcrição e fica gravado na própria mensagem;
        // imagem a IA lê do Storage na hora de responder.

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

            } else {
              await supabase.from("webhook_log").insert({
                source: "whatsapp",
                note: "falha ao baixar mídia",
                body: { waId, error: media.error },
              });
            }
          }
        }

        // Não responde aqui. Cliente manda "oi" + print + "tá dando isso" em
        // segundos, e responder mensagem por mensagem disparava um agente por
        // mensagem, em paralelo, cada um sem ver os outros. A resposta sai
        // depois, uma vez por conversa, cobrindo a rajada inteira.
        conversasNovas.set(from, nomeContato ?? conversasNovas.get(from) ?? null);
      }
    }
  }

  // Modo observação (auto reply desligado): só guarda.
  if (autoReply) {
    for (const [phone, nome] of conversasNovas) {
      // Responde 200 pra Meta já e trabalha depois (a Meta reenvia o evento se
      // demorar, e a espera da rajada + o agente passam fácil de 20s).
      after(() => responderConversa(phone, nome));
    }
  }

  return NextResponse.json({ ok: true });
}
