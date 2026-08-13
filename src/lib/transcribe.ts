// Transcrição de áudio do WhatsApp.
//
// Metade dos clientes manda áudio em vez de escrever, e até aqui isso era um
// beco sem saída: a IA só lia texto, então todo áudio caía direto no colo do
// humano — inclusive pergunta trivial que ela resolveria sozinha.
//
// A Claude não recebe áudio, então isso exige um serviço à parte. A API do Groq
// fala o mesmo formato da OpenAI, então uma função só atende os dois. A chave
// é descoberta pelo que estiver no ambiente, nesta ordem:
//
//   1. TRANSCRIBE_API_KEY  — com TRANSCRIBE_BASE_URL / TRANSCRIBE_MODEL
//   2. GROQ_API_KEY        — api.groq.com, whisper-large-v3
//   3. OPENAI_API_KEY      — api.openai.com, whisper-1
//
// Descobrir em vez de exigir um nome novo é de propósito: a chave do Groq já
// estava configurada muito antes de existir código que a usasse, e obrigar a
// renomear a env só para ligar isso seria trabalho à toa.
//
// Sem chave nenhuma, transcrever devolve erro e o áudio segue o caminho antigo
// (vai pro humano). Nada quebra por não estar configurado.

interface Provedor {
  key: string;
  baseUrl: string;
  model: string;
}

function provedor(): Provedor | null {
  const explicito = process.env.TRANSCRIBE_API_KEY;
  if (explicito) {
    return {
      key: explicito,
      baseUrl: process.env.TRANSCRIBE_BASE_URL || "https://api.openai.com/v1",
      model: process.env.TRANSCRIBE_MODEL || "whisper-1",
    };
  }
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    return {
      key: groq,
      baseUrl: process.env.TRANSCRIBE_BASE_URL || "https://api.groq.com/openai/v1",
      model: process.env.TRANSCRIBE_MODEL || "whisper-large-v3",
    };
  }
  const openai = process.env.OPENAI_API_KEY;
  if (openai) {
    return {
      key: openai,
      baseUrl: process.env.TRANSCRIBE_BASE_URL || "https://api.openai.com/v1",
      model: process.env.TRANSCRIBE_MODEL || "whisper-1",
    };
  }
  return null;
}

export function transcricaoConfigurada(): boolean {
  return provedor() !== null;
}

/** Qual provedor está em uso, para mostrar na tela de Integrações. */
export function provedorTranscricao(): string | null {
  const p = provedor();
  if (!p) return null;
  return `${new URL(p.baseUrl).host} · ${p.model}`;
}

export interface Transcricao {
  ok: boolean;
  texto?: string;
  error?: string;
}

export async function transcreverAudio(
  bytes: ArrayBuffer,
  mime: string
): Promise<Transcricao> {
  const p = provedor();
  if (!p) return { ok: false, error: "Nenhuma chave de transcrição configurada." };

  // O WhatsApp manda ogg/opus; o nome do arquivo precisa ter extensão coerente
  // ou a API recusa por formato desconhecido.
  const ext = mime.includes("ogg")
    ? "ogg"
    : mime.includes("mpeg")
      ? "mp3"
      : mime.includes("mp4") || mime.includes("m4a")
        ? "m4a"
        : mime.includes("wav")
          ? "wav"
          : "ogg";

  try {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);
    form.append("model", p.model);
    form.append("language", "pt");

    const res = await fetch(`${p.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.key}` },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: JSON.stringify(json).slice(0, 300) };

    const texto = String(json?.text ?? "").trim();
    if (!texto) return { ok: false, error: "transcrição vazia" };
    return { ok: true, texto };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro de rede" };
  }
}
