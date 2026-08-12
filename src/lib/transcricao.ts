// Transcrição de áudio do WhatsApp (voice notes em ogg/opus).
//
// A IA de suporte fala com a API da Anthropic, que não aceita áudio como
// entrada — então todo áudio passa por um Whisper antes: o texto transcrito
// vira o `text` da mensagem, aparece no inbox embaixo do player e é o que a
// Lia lê e responde.
//
// Provedor por chave na Vercel (o primeiro que existir):
//   GROQ_API_KEY   → Groq, whisper-large-v3-turbo (rápido, tier grátis bom)
//   OPENAI_API_KEY → OpenAI, whisper-1
// Sem chave nenhuma, devolve null e o fluxo segue como antes (áudio vai pro
// humano sem transcrição) — não derruba o webhook.

interface ProvedorSTT {
  nome: string;
  url: string;
  modelo: string;
  chave: string;
}

function provedor(): ProvedorSTT | null {
  if (process.env.GROQ_API_KEY) {
    return {
      nome: "groq",
      url: "https://api.groq.com/openai/v1/audio/transcriptions",
      modelo: "whisper-large-v3-turbo",
      chave: process.env.GROQ_API_KEY,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      nome: "openai",
      url: "https://api.openai.com/v1/audio/transcriptions",
      modelo: "whisper-1",
      chave: process.env.OPENAI_API_KEY,
    };
  }
  return null;
}

export function transcricaoConfigurada(): boolean {
  return provedor() !== null;
}

const EXT: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "audio/wav": "wav",
};

export async function transcreverAudio(
  bytes: ArrayBuffer,
  mime: string
): Promise<string | null> {
  const p = provedor();
  if (!p) return null;

  const mimeBase = mime.split(";")[0].trim();
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: mimeBase }),
    `audio.${EXT[mimeBase] ?? "ogg"}`
  );
  form.append("model", p.modelo);
  form.append("language", "pt");
  form.append("temperature", "0");

  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.chave}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      throw new Error(`${p.nome} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const j = (await res.json()) as { text?: string };
    const texto = (j.text ?? "").trim();
    return texto || null;
  } catch (e) {
    // Transcrição é melhoria, não requisito: erro aqui não pode derrubar o
    // recebimento da mensagem. Quem chamou loga e segue sem texto.
    throw e instanceof Error ? e : new Error("falha na transcrição");
  }
}
