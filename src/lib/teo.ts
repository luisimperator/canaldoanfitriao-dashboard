// Téo: agente de vendas no WhatsApp (via Unnichat).
//
// Versão 1 (teste): diagnóstico curto em bate-bola e convite pra call de 20
// minutos com um especialista. Não fala preço nem manda link de pagamento:
// quando o lead quer call, preço ou comprar, o Téo passa pro time humano e
// deixa uma nota no chat do Unnichat. Quem chama é /api/sync/teo (a cada minuto).
//
// A API do Unnichat é chamada pela função teo_unnichat() do banco (o token
// fica no vault e a função só aceita os caminhos que o Téo usa).

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

const MODEL = process.env.TEO_MODEL || "claude-opus-5-5";
const FALLBACK_MODEL = "claude-opus-4-8";
const EFFORT = (process.env.TEO_EFFORT || "medium") as "low" | "medium" | "high";
const MAX_TURNS = 4;
const MAX_MSGS_HISTORICO = 40;

export interface MsgUnnichat {
  id: string;
  date: string;
  senderBy: string; // contact | user | platform
  type: string;
  message: string | null;
  origin?: string | null;
  templateComponents?: unknown;
  templateBodyParameters?: unknown;
}

export interface LeadTeo {
  nome: string | null;
  criadoEm: string | null;
  respostas: Record<string, string>;
  tags: string[];
}

export interface ResultadoTeo {
  mensagens: string[];
  humano: { motivo: string; resumo: string } | null;
  ficha: string | null;
}

// ---------- Unnichat ----------

export async function unnichat(
  supabase: SupabaseClient,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown; erro?: string }> {
  const { data, error } = await supabase.rpc("teo_unnichat", {
    p_method: method,
    p_path: path,
    p_body: body ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { status: number; body: unknown; erro?: string };
}

export async function historico(supabase: SupabaseClient, contactId: string): Promise<MsgUnnichat[]> {
  const r = await unnichat(supabase, "GET", `/contact/${contactId}/messages`);
  if (r.status !== 200) throw new Error(`Unnichat messages: ${r.status} ${r.erro ?? ""}`);
  const data = (r.body as { data?: MsgUnnichat[] })?.data;
  const arr = Array.isArray(data) ? data : [];
  return [...arr].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export async function enviarTexto(supabase: SupabaseClient, phone: string, texto: string): Promise<void> {
  const r = await unnichat(supabase, "POST", "/meta/messages", { phone, messageText: texto });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`Unnichat envio: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  }
}

export async function anotar(supabase: SupabaseClient, contactId: string, texto: string): Promise<void> {
  await unnichat(supabase, "POST", `/contact/${contactId}/notes`, { message: texto });
}

// ---------- histórico -> conversa do Claude ----------

function textoDoTemplate(m: MsgUnnichat): string | null {
  const comps = Array.isArray(m.templateComponents) ? (m.templateComponents as Record<string, unknown>[]) : [];
  const corpo = comps.find((c) => String(c.type ?? "").toLowerCase() === "body");
  let txt = corpo && typeof corpo.text === "string" ? corpo.text : null;
  const params = Array.isArray(m.templateBodyParameters) ? (m.templateBodyParameters as Record<string, unknown>[]) : [];
  if (txt) {
    params.forEach((p, i) => {
      const v = typeof p.text === "string" ? p.text : "";
      txt = txt!.split(`{{${i + 1}}}`).join(v);
    });
  }
  return txt;
}

function textoDaMensagem(m: MsgUnnichat): string | null {
  if (m.senderBy === "platform") return null;
  const t = (m.message ?? "").trim();
  if (m.type === "template") {
    const tpl = textoDoTemplate(m);
    return `(mensagem automática) ${tpl ?? "[template]"}`;
  }
  if (t) return m.origin === "automation" ? `(mensagem automática) ${t}` : t;
  const tipo = m.type || "mídia";
  if (m.senderBy === "contact") {
    if (/audio|ptt/.test(tipo)) return "[o lead mandou um áudio, que você não consegue ouvir]";
    if (/image|sticker/.test(tipo)) return "[o lead mandou uma imagem, que você não consegue ver]";
    if (/video/.test(tipo)) return "[o lead mandou um vídeo, que você não consegue ver]";
    if (/document/.test(tipo)) return "[o lead mandou um arquivo]";
    return `[o lead mandou uma mensagem do tipo ${tipo}]`;
  }
  return null;
}

export function paraClaude(msgs: MsgUnnichat[], instrucaoFinal?: string): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of msgs.slice(-MAX_MSGS_HISTORICO)) {
    const txt = textoDaMensagem(m);
    if (!txt) continue;
    const role = m.senderBy === "contact" ? "user" : "assistant";
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n${txt}`;
    else out.push({ role, content: txt });
  }
  if (out.length === 0 || out[0].role !== "user") {
    out.unshift({ role: "user", content: "(início da conversa — o lead entrou na lista de espera)" });
  }
  if (instrucaoFinal) {
    const last = out[out.length - 1];
    if (last.role === "user") last.content = `${last.content as string}\n\n${instrucaoFinal}`;
    else out.push({ role: "user", content: instrucaoFinal });
  }
  return out;
}

// ---------- prompt ----------

function agoraSP(): string {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PROMPT = `Você é o Téo, da equipe do Rômulo Villela, do Canal do Anfitrião: a maior escola de Airbnb e aluguel por temporada do Brasil. Você conversa pelo WhatsApp com quem entrou na lista de espera.

# Quem você é
- Apresente-se como "Téo, da equipe do Rômulo". Não diga que é uma IA. Se perguntarem se é robô, IA ou pessoa, diga com naturalidade que é o assistente virtual do Canal e siga a conversa. Nunca negue.
- Tom: próximo, leve, brasileiro, sem formalidade e sem gíria forçada. Emoji só de vez em quando.

# Seu objetivo nesta conversa
Entender a situação da pessoa em poucas perguntas e, se fizer sentido, marcar uma call de 20 minutos com um dos nossos especialistas, que monta o plano pro caso dela e apresenta a melhor condição.

# Como conversar
- WhatsApp é bate-bola: mensagens curtas (até ~300 caracteres), UMA pergunta por mensagem. Nunca textão nem lista de recursos do curso.
- No máximo 3 a 4 perguntas antes de propor a call. Não pergunte o que a pesquisa já respondeu (veja "Sobre o lead").
- Diga uma vez por que pergunta: "te pergunto pra te indicar o caminho que faz mais sentido".
- Sempre descubra o PRAZO: "é pra começar já ou quando estiver com o imóvel em mãos?"
- Junto das perguntas, quando couber, devolva uma dica curta e útil (sem inventar números).
- Se a pessoa pular etapas ("quanto custa?", "quero comprar"), acompanhe o ritmo dela (veja "Passar pro time").

# Caminhos
- Já opera imóveis: entenda o que trava (ocupação, preço, tempo, avaliações, crescer). Muitos imóveis ou gestão de terceiros: o caminho é o Gigantes; poucos imóveis: o Anfitrião 5 Estrelas (A5E). Mas quem explica e recomenda é o especialista na call.
- Ainda não tem imóvel: descubra se tem um imóvel a caminho (na planta, em reforma, da família) ou um plano concreto sem imóvel próprio (gestão de terceiros, coanfitrião, sublocação). Se tiver, a call faz muito sentido: "dá pra aprender antes de pegar as chaves e não errar no começo". Se não tiver plano nem data, diga que existe um caminho pra começar do zero e passe pro time com motivo "airbnb_do_zero".
- Para propor a call: um motivo ligado ao caso dela + baixo compromisso. Ex.: "Pelo que você me contou, vale um papo de 20 min com um dos nossos especialistas pra montar o plano pro seu caso. Qual período fica melhor pra você: manhã, tarde ou noite?"
- Quando a pessoa topar a call: pergunte o melhor período e o e-mail pro convite. Com isso em mãos, chame passar_para_humano (motivo "call") e diga que vai confirmar o horário com o especialista e manda a confirmação por aqui. NÃO confirme horário você mesmo.

# Nunca
- Nunca fale preço, parcela, desconto, cupom ou condição, e nunca mande link de pagamento. Se perguntarem: "quem monta a melhor condição é o especialista, na call" e ofereça a call. Se insistirem em comprar já, passe pro time (motivo "comprar").
- Nunca invente conteúdo do curso, prazo, garantia, número ou resultado. Na dúvida: "o especialista te explica certinho na call".
- Nunca pressione nem use urgência falsa.
- Se a pessoa pedir pra parar, respeite: agradeça e encerre.

# Medo de golpe
Acolha ("faz todo sentido desconfiar"). Diga que ela pode conferir no Instagram do Rômulo Villela: o link de WhatsApp da bio cai neste mesmo número. Não pressione.

# Passar pro time (ferramenta passar_para_humano)
Use quando: a pessoa topar a call (já com período e e-mail); pedir preço/condição e não quiser call; quiser comprar agora; já for aluna e tiver dúvida de acesso/suporte; reclamar; pedir pra falar com uma pessoa; ou o assunto fugir do seu objetivo. Depois de chamar, mande uma última mensagem curta dizendo o próximo passo.

# Ficha (ferramenta anotar_ficha)
Quando souber algo importante (imóveis, situação, dor, objetivo, prazo, objeção), anote em uma linha. É o que o especialista lê antes da call.

# Formato da resposta
Responda só com o texto que vai pro WhatsApp. Se precisar de duas mensagens seguidas, separe com uma linha contendo só [BREAK] (no máximo 2 mensagens).`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "passar_para_humano",
    description:
      "Passa a conversa pro time humano (o Téo para de responder). Use quando o lead topar a call, pedir preço/condição, quiser comprar, for aluno com dúvida de suporte, reclamar, pedir uma pessoa, ou não tiver plano nenhum (airbnb_do_zero).",
    input_schema: {
      type: "object",
      properties: {
        motivo: {
          type: "string",
          enum: ["call", "preco", "comprar", "suporte", "airbnb_do_zero", "pediu_humano", "outro"],
        },
        resumo: {
          type: "string",
          description:
            "Ficha pro especialista em 2 a 4 linhas: situação, imóveis, dor, objetivo, prazo e, se for call, período preferido e e-mail.",
        },
      },
      required: ["motivo", "resumo"],
    },
  },
  {
    name: "anotar_ficha",
    description: "Anota na ficha do lead algo importante que ele contou (uma linha).",
    input_schema: {
      type: "object",
      properties: { nota: { type: "string" } },
      required: ["nota"],
    },
  },
];

function blocoLead(lead: LeadTeo): string {
  const r = lead.respostas;
  const linhas = [
    `- Nome: ${lead.nome ?? "(sem nome)"}`,
    lead.criadoEm ? `- Entrou na lista de espera em: ${lead.criadoEm}` : null,
    `- Pesquisa: ${
      Object.keys(r).length
        ? Object.entries(r)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")
        : "não respondeu"
    }`,
    lead.tags.length ? `- Tags: ${lead.tags.join(", ")}` : null,
  ].filter(Boolean);
  return `# Sobre o lead\n${linhas.join("\n")}`;
}

function dividir(reply: string): string[] {
  const partes = reply
    .split(/\n*\[BREAK\]\n*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  return partes.map((p) => (p.length > 900 ? `${p.slice(0, 900)}…` : p));
}

export async function rodarTeo(opts: {
  msgs: MsgUnnichat[];
  lead: LeadTeo;
  contexto: string;
  ficha: string | null;
  abrir: boolean;
}): Promise<ResultadoTeo> {
  const client = new Anthropic();
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
    {
      type: "text",
      text: [
        `# Agora\n${agoraSP()} (horário de Brasília).`,
        opts.contexto ? `# Aviso do dia\n${opts.contexto}` : null,
        blocoLead(opts.lead),
        opts.ficha ? `# Ficha até agora\n${opts.ficha}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
  const messages = paraClaude(
    opts.msgs,
    opts.abrir
      ? "[Instrução interna, o lead não vê: abra a conversa agora. Apresente-se, use UMA informação da pesquisa como gancho (se houver) e termine com uma pergunta sobre a situação dele.]"
      : undefined
  );

  let humano: ResultadoTeo["humano"] = null;
  const notas: string[] = [];
  let model = MODEL;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let resp: Anthropic.Message;
    try {
      resp = await client.messages.create({
        model,
        max_tokens: 4096,
        system,
        tools: TOOLS,
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
      });
    } catch (e) {
      if (e instanceof Anthropic.NotFoundError && model !== FALLBACK_MODEL) {
        model = FALLBACK_MODEL;
        turn--;
        continue;
      }
      throw e;
    }

    if (resp.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: resp.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const b of resp.content) {
        if (b.type !== "tool_use") continue;
        const input = (b.input ?? {}) as Record<string, string>;
        if (b.name === "passar_para_humano") {
          humano = { motivo: input.motivo ?? "outro", resumo: input.resumo ?? "" };
          results.push({
            type: "tool_result",
            tool_use_id: b.id,
            content: "Registrado: o time humano assume. Agora escreva a última mensagem curta pro lead, dizendo o próximo passo.",
          });
        } else if (b.name === "anotar_ficha") {
          if (input.nota) notas.push(input.nota);
          results.push({ type: "tool_result", tool_use_id: b.id, content: "Anotado." });
        } else {
          results.push({ type: "tool_result", tool_use_id: b.id, content: "Ferramenta desconhecida.", is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    const texto = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return {
      mensagens: texto ? dividir(texto) : [],
      humano,
      ficha: notas.length ? notas.join("\n") : null,
    };
  }
  return { mensagens: [], humano, ficha: notas.length ? notas.join("\n") : null };
}
