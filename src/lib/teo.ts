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
import { transcreverAudio, transcricaoConfigurada } from "@/lib/transcribe";

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
  /** arquivo da mídia (áudio, imagem…), público no storage do Unnichat */
  url?: string | null;
  contactId?: string;
  /** texto do áudio, preenchido por ouvirAudios() antes de o Téo responder */
  transcricao?: string;
}

export interface LeadTeo {
  nome: string | null;
  criadoEm: string | null;
  respostas: Record<string, string>;
  tags: string[];
  /** respostas do formulário de inscrição do site (Mailchimp): imóveis, faturamento */
  formulario?: Record<string, string>;
  /** e-mail do cadastro (pra confirmar no convite da call em vez de pedir de novo) */
  email?: string | null;
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

// O Téo ouve áudio: antes de responder, os áudios recentes da conversa (do lead
// e do time) viram texto pela mesma transcrição do suporte (Groq/Whisper). A
// transcrição fica em teo_audios pra não transcrever de novo a cada rodada; se
// falhar, tenta de novo até 3 vezes e, depois disso, o áudio segue como antes
// ("o lead mandou um áudio que você não consegue ouvir").
const MAX_TENTATIVAS_AUDIO = 3;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

async function baixarETranscrever(url: string): Promise<{ ok: boolean; texto?: string; erro?: string }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, erro: `download ${r.status}` };
    const bytes = await r.arrayBuffer();
    if (bytes.byteLength > MAX_AUDIO_BYTES) return { ok: false, erro: `áudio grande demais (${bytes.byteLength} bytes)` };
    const mime = (r.headers.get("content-type") || "").split(";")[0] || "audio/ogg";
    const tr = await transcreverAudio(bytes, /audio|ogg|mpeg|mp4|wav/.test(mime) ? mime : "audio/ogg");
    return tr.ok && tr.texto ? { ok: true, texto: tr.texto } : { ok: false, erro: tr.error ?? "sem texto" };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function ouvirAudios(supabase: SupabaseClient, msgs: MsgUnnichat[]): Promise<number> {
  if (!transcricaoConfigurada()) return 0;
  const audios = msgs
    .slice(-MAX_MSGS_HISTORICO)
    .filter((m) => m.senderBy !== "platform" && /audio|ptt/.test(m.type || "") && !(m.message ?? "").trim() && m.url);
  if (!audios.length) return 0;
  const { data: salvos } = await supabase
    .from("teo_audios")
    .select("msg_id, texto, tentativas")
    .in(
      "msg_id",
      audios.map((a) => a.id)
    );
  const cache = new Map((salvos ?? []).map((s) => [s.msg_id as string, s as { texto: string | null; tentativas: number }]));
  let novos = 0;
  for (const a of audios) {
    const salvo = cache.get(a.id);
    if (salvo?.texto) {
      a.transcricao = salvo.texto;
      continue;
    }
    if ((salvo?.tentativas ?? 0) >= MAX_TENTATIVAS_AUDIO) continue;
    const tr = await baixarETranscrever(a.url!);
    await supabase.from("teo_audios").upsert(
      {
        msg_id: a.id,
        contact_id: a.contactId ?? null,
        de: a.senderBy,
        texto: tr.ok ? tr.texto : null,
        erro: tr.ok ? null : (tr.erro ?? "").slice(0, 300),
        tentativas: (salvo?.tentativas ?? 0) + 1,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "msg_id" }
    );
    if (tr.ok && tr.texto) {
      a.transcricao = tr.texto;
      novos++;
    }
  }
  return novos;
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
  if (m.transcricao) {
    return m.senderBy === "contact"
      ? `(áudio do lead) ${m.transcricao}`
      : `(áudio que alguém do time mandou pro lead) ${m.transcricao}`;
  }
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
# Seu jeito
Você fala como um anfitrião experiente e gente boa, que adora o assunto e não leva a vida tão a sério: papo de WhatsApp entre adultos, não atendimento de banco.
- Tem senso de humor. Se a pessoa brinca, ironiza ou faz trocadilho, entra na brincadeira primeiro ("kkkk boa"), devolve com leveza e só depois segue. Nunca responda a uma piada como se fosse literal.
- Espelhe a pessoa: resposta curta pede resposta curta; quem escreve "kkk" pode receber "kkk"; quem é formal recebe menos gracinha.
- Emoji: quase nunca. No máximo um a cada quatro ou cinco mensagens, e nunca no fim de toda frase. Nada de 😊 por reflexo.
- Nada de frase pronta de atendente. Proibido: "Me conta", "Que bom!", "Entendi!" ou "Ah, entendi!" no começo, "Perfeito!", "Fico à disposição", "Te pergunto pra te indicar o caminho que faz mais sentido". Varie sempre; duas mensagens suas nunca começam igual.
- Nunca repita uma pergunta que você já fez. Se a resposta veio torta ou vaga, entenda o que dá pra entender, reformule com outras palavras ou siga em frente.
- Fale como gente: frases curtas, sem tom de manual. Português correto, mas solto.

# Seu objetivo nesta conversa
Entender a situação da pessoa em poucas perguntas e, se fizer sentido, marcar uma call de 20 minutos com um dos nossos especialistas, que monta o plano pro caso dela e apresenta a melhor condição.

# Como conversar
- Leia o histórico inteiro antes de responder. Se o lead perguntou ou contou algo que ficou sem resposta (às vezes há horas ou dias), comece por aí: peça desculpa pela demora em poucas palavras e responda o que ele disse, antes de qualquer pergunta sua.
- Você ouve áudio: o que o lead fala em áudio chega como "(áudio do lead) …". Responda ao que ele disse, normalmente, sem comentar que era áudio nem pedir pra escrever. Só se vier "[o lead mandou um áudio, que você não consegue ouvir]" (falhou ao ouvir), peça com leveza pra ele mandar por escrito.
- WhatsApp é bate-bola: mensagens curtas (até ~300 caracteres), UMA pergunta por mensagem. Nunca textão nem lista de recursos da comunidade.
- No máximo 3 a 4 perguntas antes de propor a call. Não pergunte o que a pesquisa ou o formulário de inscrição já responderam (veja "Sobre o lead"): use isso pra puxar assunto ("vi que você tem 7 imóveis…") e pergunte só o que falta.
- Se ajudar, diga uma vez, com suas palavras, por que está perguntando (pra indicar o caminho certo). Uma vez só na conversa toda, nunca com frase pronta.
- Sempre descubra o PRAZO: "é pra começar já ou quando estiver com o imóvel em mãos?"
- Junto das perguntas, quando couber, devolva uma dica curta e útil (sem inventar números).
- Se a pessoa pular etapas ("quanto custa?", "quero comprar"), acompanhe o ritmo dela (veja "Passar pro time").

# Caminhos
- Já opera imóveis: entenda o que trava (ocupação, preço, tempo, avaliações, crescer). Muitos imóveis ou gestão de terceiros: o caminho é o Gigantes; poucos imóveis: o Anfitrião 5 Estrelas. Mas quem explica e recomenda é o especialista na call.
- Ainda não tem imóvel: descubra se tem um imóvel a caminho (na planta, em reforma, da família) ou um plano concreto sem imóvel próprio (gestão de terceiros, coanfitrião, sublocação). Se tiver, a call faz muito sentido: "dá pra aprender antes de pegar as chaves e não errar no começo". Se não tiver plano nem data, diga que existe um caminho pra começar do zero e passe pro time com motivo "airbnb_do_zero".
- Exemplo do tom certo. Lead: "imóvel rodando? não, ele fica parado". Você: "kkkk boa, imóvel que roda é outra categoria. Parado e sem render então. Ele já tá mobiliado ou ainda precisa de um tapa?"
- Para propor a call: um motivo ligado ao caso dela + baixo compromisso, com DOIS horários concretos da lista "Horários livres pra call", dizendo com quem é cada um (primeiro nome do especialista). Diga o que a call é de verdade: o especialista entende o cenário da pessoa e explica a comunidade (o que tem dentro, como funciona, investimento) pra ver se faz sentido pro momento dela. Não prometa plano, estratégia, diagnóstico nem consultoria. Ex.: "Pelo que você me contou, vale um papo de 20 min com um dos nossos especialistas: ele entende melhor o seu cenário e te mostra como a comunidade funciona e se faz sentido pro seu momento. Amanhã às 10h com o Breno ou às 11h com a Priscila, qual fica melhor?"
- Quando a pessoa escolher um horário da lista: peça o e-mail pro convite (se ainda não tiver). Com horário + e-mail, chame marcar_call (só o horário, no formato AAAA-MM-DDTHH:MM). Se der certo, confirme em uma mensagem: dia, hora, o nome do especialista, que é uma chamada de vídeo de 20 min e que o convite com o link chega no e-mail dela (e que você manda um lembrete por aqui antes). Depois siga disponível pra dúvidas (não passe pro time só por ter marcado).
- Se nenhum horário da lista servir, pergunte qual dia e período funcionam e chame passar_para_humano (motivo "call") com a preferência dela. Nunca invente horário fora da lista.
- Se marcar_call disser que o horário foi ocupado, ofereça outros dois da lista.

# Preço
- Se a pessoa perguntar preço, valor ou quanto custa, responda NA HORA, sem enrolar. Use a ancoragem da seção "Preços", nesta ordem: a mentoria, depois o Gigantes, e por último o produto que faz sentido pro caso dela (normalmente o Anfitrião 5 Estrelas), com o valor à vista e o parcelado. Em seguida, uma pergunta curta ("faz sentido pra você?") e a call pra ver a melhor condição.
- Esconder o preço faz perder venda. Nunca responda "o especialista te passa" quando perguntarem o valor.
- Nunca ofereça desconto, cupom ou condição especial: isso é com o especialista, na call.
- Não mande link de pagamento. Se a pessoa quiser comprar já, passe pro time (motivo "comprar").

# Nunca
- Nunca invente conteúdo da comunidade, prazo, garantia, número ou resultado. Na dúvida: "o especialista te explica certinho na call".
- Nunca pressione nem use urgência falsa.
- Se a pessoa pedir pra parar, respeite: agradeça e encerre.

# Medo de golpe
Acolha ("faz todo sentido desconfiar"). Diga que ela pode conferir no Instagram do Rômulo Villela: o link de WhatsApp da bio cai neste mesmo número. Não pressione.

# Passar pro time (ferramenta passar_para_humano)
Use quando: a pessoa quiser call mas nenhum horário da lista servir; pedir desconto ou condição especial e não quiser call; quiser comprar agora; já for aluna e tiver dúvida de acesso/suporte; reclamar; pedir pra falar com uma pessoa; ou o assunto fugir do seu objetivo. Depois de chamar, mande uma última mensagem curta dizendo o próximo passo.

# Ficha (ferramenta anotar_ficha)
Quando souber algo importante (imóveis, situação, dor, objetivo, prazo, objeção), anote em uma linha. É o que o especialista lê antes da call.

# Formato da resposta
Responda só com o texto que vai pro WhatsApp. Se precisar de duas mensagens seguidas, separe com uma linha contendo só [BREAK] (no máximo 2 mensagens).
Quando a última mensagem do lead só fecha a conversa ("ok", "obrigado", "igualmente", "até amanhã", um emoji) e você já se despediu, não precisa ter a última palavra: responda só [SEM_RESPOSTA] e nada vai pro lead.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "marcar_call",
    description:
      "Marca a call de 20 min com um especialista num horário da lista de horários livres. Precisa do horário escolhido pelo lead e do e-mail dele.",
    input_schema: {
      type: "object",
      properties: {
        horario: {
          type: "string",
          description: "Exatamente um dos horários da lista 'Horários livres pra call' (formato AAAA-MM-DDTHH:MM).",
        },
        email: { type: "string" },
        resumo: {
          type: "string",
          description: "Ficha pro especialista em 2 a 4 linhas: situação, imóveis, dor, objetivo e prazo.",
        },
      },
      required: ["horario", "email", "resumo"],
    },
  },
  {
    name: "passar_para_humano",
    description:
      "Passa a conversa pro time humano (o Téo para de responder). Use quando o lead quiser call mas nenhum horário servir, pedir preço/condição, quiser comprar, for aluno com dúvida de suporte, reclamar, pedir uma pessoa, ou não tiver plano nenhum (airbnb_do_zero).",
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
    lead.formulario && Object.keys(lead.formulario).length
      ? `- Formulário de inscrição (site): ${Object.entries(lead.formulario)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")}`
      : null,
    lead.email
      ? `- E-mail do cadastro: ${lead.email} (pro convite da call, confirme este em vez de pedir: "mando o convite pro ${lead.email}?")`
      : null,
    lead.tags.length ? `- Tags: ${lead.tags.join(", ")}` : null,
  ].filter(Boolean);
  return `# Sobre o lead\n${linhas.join("\n")}`;
}

function dividir(reply: string): string[] {
  const partes = reply
    .split(/\n*\[BREAK\]\n*/i)
    .map((s) => s.trim())
    .filter((s) => s && !/^\[?SEM[_ ]RESPOSTA\]?$/i.test(s))
    .slice(0, 3);
  return partes.map((p) => (p.length > 900 ? `${p.slice(0, 900)}…` : p));
}

export async function rodarTeo(opts: {
  msgs: MsgUnnichat[];
  lead: LeadTeo;
  contexto: string;
  precos: string;
  /** ajustes de tom/regra vindos de teo_config.instrucoes_extras (sem deploy) */
  extras: string;
  ficha: string | null;
  abrir: boolean;
  /** acompanhamento: instrução pro Téo retomar a conversa com quem parou de responder */
  retomar?: string;
  /** primeiro nome de quem do time já conversou com o lead: a call é com essa pessoa */
  especialista?: string | null;
  /** horários livres pra call, já em horário de Brasília (AAAA-MM-DDTHH:MM) */
  horariosLivres: string[];
  marcarCall: (args: { horario: string; email: string; resumo: string }) => Promise<string>;
}): Promise<ResultadoTeo> {
  const client = new Anthropic();
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
    {
      type: "text",
      text: [
        `# Agora\n${agoraSP()} (horário de Brasília).`,
        opts.contexto ? `# Aviso do dia\n${opts.contexto}` : null,
        opts.precos ? `# Preços\n${opts.precos}` : null,
        `# Horários livres pra call (horário de Brasília)\n${
          opts.especialista
            ? `${opts.especialista} já conversou com este lead, então a call é com ${opts.especialista}: os horários abaixo já são só os dessa pessoa. Pode dizer que é com quem já falou com o lead.\n`
            : ""
        }${
          opts.horariosLivres.some((h) => h.endsWith(" *"))
            ? "Horário com * já tem outra call no mesmo horário, com outro especialista. Ofereça os sem *; um com * só se o lead pedir exatamente esse horário.\n"
            : ""
        }${
          opts.horariosLivres.length ? opts.horariosLivres.join(", ") : "nenhum no momento: pergunte dia e período e passe pro time"
        }`,
        blocoLead(opts.lead),
        opts.ficha ? `# Ficha até agora\n${opts.ficha}` : null,
        opts.extras ? `# Ajustes do dono (valem acima das regras gerais)\n${opts.extras}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
  const messages = paraClaude(
    opts.msgs,
    opts.abrir
      ? "[Instrução interna, o lead não vê: abra a conversa agora. Apresente-se, use UMA informação da pesquisa como gancho (se houver) e termine com uma pergunta sobre a situação dele.]"
      : opts.retomar
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
        } else if (b.name === "marcar_call") {
          const out = await opts.marcarCall({
            horario: input.horario ?? "",
            email: input.email ?? "",
            resumo: input.resumo ?? "",
          });
          results.push({ type: "tool_result", tool_use_id: b.id, content: out });
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
