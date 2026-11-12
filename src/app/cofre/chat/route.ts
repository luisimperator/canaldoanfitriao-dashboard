import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { liberado } from "@/lib/roteiros/porta";
import { casesParaPrompt } from "@/lib/cofre/dados";

// Chat do Cofre de Cases: o vendedor descreve o lead (ou pede um tipo de case)
// e o Claude indica os cases certos, com [[id]] que a página vira botão de
// abrir e de dar play. Responde em streaming (texto puro). Só pra quem passou
// pela senha dos roteiros.

export const maxDuration = 60;

const MODELOS = [process.env.COFRE_MODEL || "claude-sonnet-5-5", "claude-opus-5-5"];
const CACHE_1H = { type: "ephemeral", ttl: "1h" } as const;

const PROMPT = `Você ajuda o time comercial do Canal do Anfitrião (Rômulo Villela) no meio de calls de venda da comunidade Anfitrião 5 Estrelas (curso + grupo de WhatsApp + lives) e do Gigantes da Temporada. O vendedor descreve o lead ou pede um tipo de prova, e você indica os cases do cofre que mais servem.

Regras:
- Responda em português do Brasil, direto e curto: no máximo ~140 palavras. O vendedor está em call.
- Indique de 1 a 3 cases, do mais forte pro menos. Cite cada um como [[id]] (exatamente o id da lista, entre colchetes duplos) seguido do nome. A página transforma isso em botão de abrir e de dar play.
- Pra cada case: por que ele serve pra esse lead (em 1 linha) e a fala sugerida pro vendedor (1 ou 2 frases, natural, sem exagero).
- Prefira força A (aluno com número), depois B. Prefira vídeo do YouTube quando for pra mandar o link pro lead; vídeo da área de membros só dá pra mostrar na tela.
- Combine pelo que mais pesa: a objeção do lead, depois perfil e tipo de imóvel, depois cidade/região.
- Use só os cases da lista e só os fatos e números que estão nela. Nunca invente número, nome, cidade ou resultado. Se nenhum case servir bem, diga isso e sugira o mais próximo.
- Na fala pro lead, chame o produto de "Anfitrião 5 Estrelas" ou "comunidade", nunca de "A5E". Não prometa ganho: o case mostra o que outra pessoa fez.
- Se o vendedor perguntar algo fora do cofre (preço, roteiro), responda em 1 frase e volte aos cases.
- Formato: texto simples, pode usar **negrito** e quebras de linha. Sem títulos, sem tabelas.

Cases do cofre:
`;

let sistema: Anthropic.TextBlockParam[] | null = null;
function system(): Anthropic.TextBlockParam[] {
  if (!sistema) sistema = [{ type: "text", text: PROMPT + casesParaPrompt(), cache_control: CACHE_1H }];
  return sistema;
}

type Msg = { role: "user" | "assistant"; content: string };

function limpa(body: unknown): Msg[] {
  const lista = Array.isArray((body as { mensagens?: unknown })?.mensagens) ? (body as { mensagens: unknown[] }).mensagens : [];
  const msgs = lista
    .map((m) => m as { role?: unknown; content?: unknown })
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role as Msg["role"], content: String(m.content).slice(0, 2000) }))
    .slice(-12);
  // a conversa tem que começar pelo vendedor e alternar
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs.filter((m, i) => i === 0 || m.role !== msgs[i - 1].role);
}

export async function POST(request: NextRequest) {
  if (!liberado(request)) return Response.json({ error: "Entre com a senha do cofre." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Chat sem chave da Anthropic configurada." }, { status: 503 });
  const mensagens = limpa(await request.json().catch(() => null));
  if (!mensagens.length || mensagens[mensagens.length - 1].role !== "user") {
    return Response.json({ error: "Mande uma pergunta." }, { status: 400 });
  }

  const client = new Anthropic();
  const enc = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < MODELOS.length; i++) {
        let mandou = false;
        try {
          const stream = client.messages.stream({
            model: MODELOS[i],
            max_tokens: 1200,
            system: system(),
            messages: mensagens,
            thinking: { type: "adaptive" },
            output_config: { effort: "low" },
          });
          stream.on("text", (t) => {
            mandou = true;
            controller.enqueue(enc.encode(t));
          });
          await stream.finalMessage();
          break;
        } catch (e) {
          // Modelo indisponível antes de começar a responder: tenta o próximo.
          if (!mandou && e instanceof Anthropic.NotFoundError && i < MODELOS.length - 1) continue;
          if (!mandou) controller.enqueue(enc.encode("Não consegui responder agora. Tente de novo em instantes."));
          break;
        }
      }
      controller.close();
    },
  });
  return new Response(corpo, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
