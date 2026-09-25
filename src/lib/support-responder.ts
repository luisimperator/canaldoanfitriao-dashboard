import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendWhatsappText } from "@/lib/whatsapp";
import {
  runSupportAgent,
  type AgentImage,
  type AgentMessage,
} from "@/lib/support-ai";

// Responde uma conversa do WhatsApp: UMA execução do agente por vez, cobrindo
// todas as mensagens do cliente que ainda não tiveram resposta.
//
// Antes o webhook rodava o agente por mensagem, em paralelo. Quem mandava
// "oi" + print + "tá dando isso" em 5 segundos recebia três respostas que não
// se conheciam: repetidas, contraditórias ("não consigo ver imagem" junto de
// "esse aviso aparece quando…"), pedindo dado que o cliente já tinha dado.
//
// Agora:
//   1. espera a rajada terminar (ESPERA_RAJADA_MS sem mensagem nova);
//   2. se chegou mensagem mais nova, sai: quem responde é o handler dela;
//   3. pega a trava da conversa (support_ia_lock). Ocupada = outra resposta
//      em andamento; espera ela terminar e responde o que sobrou;
//   4. junta TUDO que o cliente mandou depois da última resposta nossa
//      (textos, áudios transcritos, imagens do Storage) num turno só.

const ESPERA_RAJADA_MS = 7_000;
const ESPERA_TRAVA_MS = 3_000;
// maxDuration do webhook é 300s: 7s de rajada + até 120s de fila + o agente.
const ESPERA_TRAVA_MAX_MS = 120_000;
const HISTORICO_MAX = 40;
const IMAGENS_MAX = 4;
const VISION_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Linha {
  id: string;
  direction: string;
  text: string | null;
  tipo: string | null;
  media_path: string | null;
  media_mime: string | null;
  created_at: string;
}

// Como uma mensagem aparece pro agente quando é histórico (sem o arquivo).
function comoTexto(m: Linha): string | null {
  const t = m.text?.trim() || "";
  if (!m.tipo || m.tipo === "text" || m.tipo === "template") return t || null;
  const rotulo: Record<string, string> = {
    image: "[imagem]",
    audio: "[áudio]",
    video: "[vídeo]",
    document: "[documento]",
    sticker: "[figurinha]",
  };
  const r = rotulo[m.tipo] ?? `[${m.tipo}]`;
  // áudio transcrito já vem como "🎙️ texto"
  if (t) return m.tipo === "audio" ? t : `${r} ${t}`;
  return r;
}

async function log(note: string, body: Record<string, unknown>) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin.from("webhook_log").insert({ source: "whatsapp", note, body });
}

export async function responderConversa(phone: string, nome: string | null): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  // Última mensagem do cliente que ESTE handler viu.
  const ultimaEntrada = async (): Promise<string | null> => {
    const { data } = await admin
      .from("support_messages")
      .select("created_at")
      .eq("wa_phone", phone)
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.created_at ?? null;
  };

  const minha = await ultimaEntrada();
  await dormir(ESPERA_RAJADA_MS);

  // 2-3. Só o handler da mensagem mais nova segue; ele pega a trava.
  const inicio = Date.now();
  for (;;) {
    if ((await ultimaEntrada()) !== minha) return; // chegou coisa nova: ela responde
    const { data: pegou } = await admin.rpc("support_ia_lock", { p_phone: phone, p_segundos: 240 });
    if (pegou === true) break;
    if (Date.now() - inicio > ESPERA_TRAVA_MAX_MS) {
      await log("ERRO: IA ocupada tempo demais nesta conversa, mensagem ficou pro humano", { phone });
      return;
    }
    await dormir(ESPERA_TRAVA_MS);
  }

  try {
    const { data: conversa } = await admin
      .from("support_conversas")
      .select("ia_ativa")
      .eq("wa_phone", phone)
      .maybeSingle();
    if (conversa && conversa.ia_ativa === false) return; // humano assumiu

    const { data: linhas } = await admin
      .from("support_messages")
      .select("id,direction,text,tipo,media_path,media_mime,created_at")
      .eq("wa_phone", phone)
      .order("created_at", { ascending: false })
      .limit(HISTORICO_MAX + 20);
    const todas = ((linhas ?? []) as Linha[]).reverse();

    // 4. O que o cliente mandou depois da nossa última resposta (IA ou humano).
    let corte = todas.length;
    while (corte > 0 && todas[corte - 1].direction === "in") corte--;
    const pendentes = todas.slice(corte);
    if (pendentes.length === 0) return; // outra execução já respondeu

    // Anexo que a IA não interpreta (vídeo, PDF, figurinha, áudio sem
    // transcrição) sozinho continua indo direto pro humano.
    const entende = pendentes.some(
      (m) =>
        (m.text && m.text.trim()) ||
        (m.tipo === "image" && m.media_path && VISION_MIMES.has((m.media_mime ?? "").split(";")[0].trim()))
    );
    if (!entende) return;

    const history: AgentMessage[] = todas
      .slice(Math.max(0, corte - HISTORICO_MAX), corte)
      .map((m) => ({ m, t: comoTexto(m) }))
      .filter((x): x is { m: Linha; t: string } => Boolean(x.t))
      .map(({ m, t }) => ({ role: m.direction === "in" ? "user" : "assistant", content: t }));

    const texto = pendentes
      .map(comoTexto)
      .filter(Boolean)
      .join("\n");

    const images: AgentImage[] = [];
    for (const m of pendentes) {
      if (images.length >= IMAGENS_MAX) break;
      const mime = (m.media_mime ?? "").split(";")[0].trim();
      if (m.tipo !== "image" || !m.media_path || !VISION_MIMES.has(mime)) continue;
      const { data: arq } = await admin.storage.from("whatsapp").download(m.media_path);
      if (!arq) continue;
      images.push({ mime, base64: Buffer.from(await arq.arrayBuffer()).toString("base64") });
    }

    let result;
    try {
      result = await runSupportAgent(texto, history, [], images, { phone, nome });
    } catch (e) {
      await log("erro ao processar mensagem", {
        to: phone,
        error: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    // Envia em mensagens separadas, como um atendente no WhatsApp.
    for (let i = 0; i < result.messages.length; i++) {
      const part = result.messages[i];
      const sent = await sendWhatsappText(phone, part);
      await admin.from("support_messages").insert({
        wa_phone: phone,
        direction: "out",
        text: part,
        tipo: "text",
        autor: "ia",
        wa_message_id: sent.id ?? null,
        // marca o caso só na última mensagem do turno
        escalated: i === result.messages.length - 1 ? result.escalated : false,
      });
      if (!sent.ok) {
        await log("falha ao enviar resposta", { to: phone, error: sent.error });
        break;
      }
      if (i < result.messages.length - 1) await dormir(600);
    }
  } finally {
    await admin.rpc("support_ia_unlock", { p_phone: phone });
  }
}
