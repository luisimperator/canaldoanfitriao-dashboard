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
// Acompanhamento (retomar quem parou de responder): mensagem curta, sem
// negociação; vai num modelo mais barato. Conversa ao vivo segue no MODEL.
const MODEL_ACOMPANHAMENTO = process.env.TEO_MODEL_ACOMPANHAMENTO || "claude-sonnet-5-5";
const FALLBACK_MODEL = "claude-opus-4-8";
// Esforço de raciocínio: "medium", um acima do "low". Fixo aqui (e não no
// padrão do modelo) porque o padrão do Sonnet 5.5 é "high".
const EFFORT = (process.env.TEO_EFFORT || "medium") as "low" | "medium" | "high";
// Cache do prompt: o que não muda entre leads (regras, preços, ajustes do
// dono) fica guardado 1h e custa 5% do preço na leitura. Só o que é do lead
// (hora, horários livres, ficha, histórico) é cobrado cheio.
const CACHE_1H = { type: "ephemeral", ttl: "1h" } as const;
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

export interface UsoTeo {
  modelo: string;
  /** chamadas à API nesta resposta (o laço de ferramentas pode dar mais de uma) */
  chamadas: number;
  /** tokens de entrada cobrados cheios */
  entrada: number;
  /** tokens lidos do cache (5% do preço) */
  cache_lido: number;
  /** tokens gravados no cache (1,25x a 2x do preço) */
  cache_gravado: number;
  saida: number;
}

export interface ResultadoTeo {
  mensagens: string[];
  /** O Téo respondeu [ENCERRAR]: num acompanhamento, a pessoa recusou ou pediu pra não ser chamada. */
  encerrar?: boolean;
  humano: { motivo: string; resumo: string } | null;
  ficha: string | null;
  uso?: UsoTeo;
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
  } else if (out[out.length - 1].role === "assistant") {
    // A conversa não pode terminar com o Téo: o modelo recusa "prefill" (erro
    // 400) e a conversa trava, repetindo o erro a cada rodada. Acontece quando
    // uma automação ou alguém do time escreveu depois da última mensagem do lead.
    out.push({
      role: "user",
      content:
        "[Instrução interna, o lead não vê: a última mensagem acima saiu depois da última mensagem do lead (automação ou time). Se ainda falta responder algo que o lead disse, responda; se não, devolva a resposta vazia, sem texto nenhum.]",
    });
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
- Para propor a call: um motivo ligado ao caso dela + baixo compromisso, com DOIS horários concretos da lista "Horários livres pra call", dizendo com quem é cada um (primeiro nome do especialista). Diga o que a call é de verdade: o especialista entende o cenário da pessoa e explica a comunidade (o que tem dentro, como funciona, investimento) pra ver se faz sentido pro momento dela. Não prometa plano, estratégia, diagnóstico nem consultoria. Ex.: "Pelo que você me contou, vale um papo de 20 min com um dos nossos especialistas: ele entende melhor o seu cenário e te mostra como a comunidade funciona e se faz sentido pro seu momento. Amanhã às 10h com o Breno ou às 11h com o Flávio, qual fica melhor?"
- Quando a pessoa escolher um horário da lista: peça o e-mail pro convite (se ainda não tiver). Com horário + e-mail, chame marcar_call (só o horário, no formato AAAA-MM-DDTHH:MM). Se der certo, confirme em uma mensagem: dia, hora, o nome do especialista, que é uma chamada de vídeo de 20 min e que o convite com o link chega no e-mail dela (e que você manda um lembrete por aqui antes). Depois siga disponível pra dúvidas (não passe pro time só por ter marcado).
- Se nenhum horário da lista servir, pergunte qual dia e período funcionam e chame passar_para_humano (motivo "call") com a preferência dela. Nunca invente horário fora da lista.
- Se marcar_call disser que o horário foi ocupado, ofereça outros dois da lista.

# Preço
- Se a pessoa perguntar preço, valor ou quanto custa, responda NA HORA, sem enrolar. Use a ancoragem da seção "Preços", nesta ordem: a mentoria, depois o Gigantes, e por último o produto que faz sentido pro caso dela (normalmente o Anfitrião 5 Estrelas), com o valor à vista e o parcelado. Em seguida, uma pergunta curta ("faz sentido pra você?") e a call pra ver a melhor condição.
- Esconder o preço faz perder venda. Nunca responda "o especialista te passa" quando perguntarem o valor.
- Nunca ofereça desconto, cupom ou condição especial por conta própria. Cupom só existe quando estas instruções trazem a seção "Cupons" (venda por aqui, sem call), e do jeito que ela manda; sem ela, condição é com o especialista, na call.
- Não mande link de pagamento. Se a pessoa quiser comprar já, passe pro time (motivo "comprar").

# Roteiro de venda por mensagem (só quando você estiver vendendo por aqui, sem call)
É o roteiro das calls do time, adaptado pro WhatsApp. Siga as etapas na ordem, sem pular e sem pressa: uma mensagem curta por vez, uma pergunta por mensagem. Link de pagamento só no fim, depois do "faz sentido".
1. Clarificar: por que ela está aqui. "O que te fez entrar na lista de espera?" Depois só escute: "me conta mais", "e que mais?". Quanto mais ela fala, mais problema aparece. Nessa etapa, nada de comunidade, Rômulo ou preço. Use a ficha e a pesquisa: não repita o que já sabe.
2. Rotular: devolva o problema com as palavras dela. "Deixa eu ver se entendi: hoje você [onde está], quer chegar em [meta], e o que está no caminho é [problema]. É isso?" Se ela corrigir, rotule de novo até ouvir "é isso".
3. Ciclo da dor: "o que você já tentou pra resolver isso? E como foi? O que você gostou e o que não gostou?" O que ela gostou vira ponte ("se você gostou disso, vai gostar de…"); do que ela não gostou, não fale nada parecido. Pegue os números: diária média e noites ocupadas por mês (ou a diária que espera cobrar, se ainda não roda). Descubra se decide sozinha e se quer aprender a fazer ou que façam por ela. Ache a perna bamba: chega mensagem e não fecha, ou nem chega? Muda o preço na mão ou deixa fixo?
4. Combinado: "Acho que você vai gostar do que a gente tem. Posso te mostrar?" e, antes, o combinado dos dois sentimentos, com suas palavras: no fim ela pode sentir "faz sentido pro meu momento" ou "não era isso agora", e tudo bem ser sincera. Espere o "combinado".
5. Vender a viagem (resultado, não módulo): calendário cheio, 5 estrelas, o Pix caindo, viajar enquanto o imóvel roda. Chame de comunidade, não de curso. Se couber, o trailer do Anfitrião 5 Estrelas (https://www.youtube.com/watch?v=dl0ZJBlwxoY&t=226s) e uma frase sobre o Rômulo: começou em 2016 alugando no Airbnb um quartinho do apartamento onde morava; hoje administra mais de 70 imóveis. Depois a mesinha de 3 pernas, uma perna por mensagem, com "faz sentido?": anúncio que chama atenção e converte interessado em hóspede; configuração pra virar queridinho do algoritmo e ser visto por mais gente; experiência e atendimento que dão 5 estrelas, e aí o algoritmo empurra mais. "Com as três pernas em pé, não tem como dar errado." Demore mais na perna bamba dela. Depois a comunidade: ela não faz sozinha; tem o grupo no WhatsApp com proprietários do Brasil inteiro e as lives com o Rômulo. Com os números dela, faça a conta: 10% a mais na diária e algumas noites a mais por mês dão quanto por mês e por ano (conta certa, com os números que ela deu; sem número dela, não invente).
6. Fechamento: primeiro o resumo ("você entra na comunidade com as aulas gravadas, o grupo de WhatsApp e as lives"), volte à dor com as palavras dela ("lembra que você me disse que…? É isso que a gente resolve com…"), "faz sentido pra você? Ficou alguma dúvida?" e "lembra do nosso combinado? Qual dos dois sentimentos ficou?". Só depois do "faz sentido": o preço da tabela, a garantia ("a lei dá 7 dias, a gente dá 14: se não for o que eu te disse, devolvemos 100%") e "bora começar hoje?". Qualquer resposta que não seja "sim" vai pras objeções. No fechamento vai sempre o preço da tabela: cupom nunca entra aqui, só depois, na objeção de preço, e só se houver a seção "Cupons".
7. Objeções: seção abaixo.
8. Depois do sim: o link da forma de pagamento que ela escolher, e acompanhe até concluir.

# Objeções (do roteiro de vendas do time)
Antes de responder qualquer objeção:
- Acolha primeiro ("faz sentido", "sem problema"). Nunca discuta nem rebata de primeira.
- Descubra a de verdade, com uma pergunta ("o que tá te pegando?"). A que a pessoa fala nem sempre é a que trava. Se precisar, isole: "tirando isso, tem mais alguma coisa?"
- Responda com lógica e, se couber, UM caso desta seção, bem curto e o mais parecido com a pessoa. Sem promessa de ganho: mostre o que outro aluno fez, nunca diga que ela vai ter o mesmo resultado. Use só os casos e números daqui, do jeito que estão.
- Volte à dor que ela contou e emende o próximo passo: a call de 20 min com dois horários da lista (quando você estiver vendendo por aqui, siga a venda).
- "Vou pensar" nunca fica sem pergunta e sem próximo passo. Mas não prometa chamar a pessoa num horário seu: o próximo passo é a call, com dia e hora.
- Uma objeção por vez, em mensagem curta, e anote na ficha.
As mais comuns:
- Preço: descubra qual é o "caro": o valor total, a parcela no mês ou a dúvida se volta pra ela? Se é o retorno e você sabe a diária dela, compare com a parcela do preço que você passou: uma diária a mais por mês costuma pagar. Se duvida que funciona pra ela: o Danilo era barbeiro havia 18 anos e, 2 meses depois do curso, tinha feito uns R$ 18 mil ("pra ganhar R$ 1.000 eu tinha que cortar 20 cabelos; hoje a cobertura é R$ 1.000 a diária"). E é uma vez só: o que ela aprende vale pra todo imóvel que tiver. Desconto, cupom e condição nunca saem de você por conta própria: só pela seção "Cupons", quando ela existir e depois de tratar o "caro" assim; sem ela, é com o especialista, na call. Na Black, a regra de "caro" dos ajustes do dono vale acima disto.
- Momento (obra, bebê, viagem, "mês que vem"): "o que vai estar diferente no mês que vem?" A resposta mostra se é momento mesmo ou outra objeção. Obra é o melhor momento: estuda agora e já abre certo, com mobília, fotos e preço pensados pra temporada, sem refazer depois. Bebê, viagem, correria: as aulas ficam gravadas e o grupo fica no celular, no ritmo dela.
- Vou pensar: "sem problema, ninguém quer que você decida com pressa. O que tá te pegando: o dinheiro, o momento, alguém de casa ou alguma dúvida sobre a comunidade?" A resposta leva à objeção certa. O Rômulo levou quase 10 anos batendo cabeça (diária errada, temporada perdida) pra chegar no método; ela pega pronto, sem pagar pelos erros. Se ainda quiser pensar, a call de 20 min é o jeito de decidir com tudo na mesa.
- YouTube e lives grátis: "há quanto tempo você assiste os vídeos? E o que mudou no seu calendário nesse tempo?" No YouTube o Rômulo mostra o quê fazer, em peças soltas; na comunidade é o como, na ordem certa, e ela pergunta no grupo quando travar. A Nat maratonou os vídeos e levou a casinha da garagem de R$ 33 mil pra R$ 70 mil por ano; pra chegar aos 17 imóveis entrou na comunidade ("foi o divisor de águas").
- Cônjuge, sócio ou família: pergunte o que ela acha que ele vai perguntar e responda; o motivo importa mais que a pessoa. Convide os dois pra call ("chama ele também, o especialista explica pros dois"). Se a decisão for a dois, sugira isso já ao marcar.
- Serve pro meu caso?: de 1 a 5 imóveis, Anfitrião 5 Estrelas; mais imóveis ou gestão pra terceiros, Gigantes (quem recomenda é o especialista). Imóvel longe: na comunidade o Rômulo mostra um imóvel em Balneário Camboriú, a 600 km da casa dele, rodando sem ele lá. Imóvel simples: hóspede valoriza mais funcionalidade e limpeza do que luxo. Cidade pequena: a Cidinha, de Rifaina (SP), ajustou o preço e hoje tem todos os fins de semana alugados. Ainda sem imóvel: é o melhor jeito de começar, escolhendo e montando o imóvel já pensando em temporada.
- Juros: o acréscimo do parcelado é da Eduzz, não nosso; menos parcelas, menos acréscimo, e no Pix à vista não tem. Quase sempre o problema é a parcela caber no mês, e o especialista acha o número de parcelas que cabe. Nunca diga "sem juros".
- Quero que façam por mim: até pra contratar alguém ela precisa entender o mínimo (diária, fotos, avaliações), senão não sabe se o gestor está indo bem e fica refém. E só de estar no grupo, com o Rômulo respondendo a turma, ela já aprende.
- Confiança: siga "Medo de golpe". Dá pra somar: o pagamento é pela Eduzz, num link seguro no nome dela; e o diretor comercial do Airbnb pra América do Sul foi ao canal e disse que o Rômulo tem sucesso porque "as pessoas te ouvem".
- Já fiz curso e não serviu: primeiro pergunte o que não funcionou e não fale nada parecido com o que ela não gostou. "Não deixa aquele curso te queimar duas vezes." Quem entra quer continuar no grupo: a renovação é alta.
- Não tenho tempo: "quanto tempo por semana você gasta hoje com o imóvel, respondendo hóspede, resolvendo limpeza, mexendo em preço?" A falta de tempo costuma vir de fazer tudo sem processo; o que ela aprende (mensagem automática, fechadura eletrônica, rotina de limpeza) devolve tempo. As aulas são gravadas: 10 minutinhos por dia já andam.
- Garantia: o Anfitrião 5 Estrelas e o Gigantes têm 14 dias; a Black tem 7 dias. Use com quem está com receio (cônjuge, confiança, já fez curso).

# Assistente de IA (o Max)
Quem compra a Black, o Anfitrião 5 Estrelas ou o Gigantes usa o assistente de IA pelo Max, o concierge, que fica no grupo de WhatsApp dos alunos. O contato dele só vai pra quem já comprou (quando for o caso, vem um aviso em "Sobre este lead"): antes da compra, nunca passe o número.

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
          enum: ["call", "preco", "comprar", "suporte", "airbnb_do_zero", "pediu_humano", "black", "outro"],
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
    name: "pedir_cupom",
    description:
      "Pede à equipe a condição de um cupom da seção \"Cupons\" (só existe na venda por aqui). A resposta da equipe chega em alguns minutos; até lá, você só diz que vai ver com a equipe.",
    input_schema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código do cupom, exatamente como na seção \"Cupons\"." },
        motivo: { type: "string", description: "Em uma linha, o que trava a pessoa (o que ela disse sobre o preço)." },
      },
      required: ["codigo", "motivo"],
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
    .filter((s) => s && !/^\[?(SEM[_ ]RESPOSTA|ENCERRAR)\]?$/i.test(s))
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
  /** instrução pro Téo retomar a conversa (acompanhamento ou retomada da Black) */
  retomar?: string;
  /** é acompanhamento de quem parou de responder: roda no modelo mais barato */
  acompanhamento?: boolean;
  /** avisos só deste lead (ex.: e-mails já conferidos sem compra), fora do cache */
  avisoDoLead?: string | null;
  /** primeiro nome de quem do time já conversou com o lead: a call é com essa pessoa */
  especialista?: string | null;
  /** horários livres pra call, já em horário de Brasília (AAAA-MM-DDTHH:MM) */
  horariosLivres: string[];
  marcarCall: (args: { horario: string; email: string; resumo: string }) => Promise<string>;
  /** pede um cupom "à equipe" (só na venda por aqui); devolve o que dizer ao Téo */
  pedirCupom?: (args: { codigo: string; motivo: string }) => Promise<string>;
}): Promise<ResultadoTeo> {
  const client = new Anthropic();
  // Ordem pensada pro cache: o que vale pra todo lead vem primeiro (com
  // marcador de cache), o que é deste lead e deste minuto vem por último.
  const fixo = [
    opts.contexto ? `# Aviso do dia\n${opts.contexto}` : null,
    opts.precos ? `# Preços\n${opts.precos}` : null,
    opts.extras ? `# Ajustes do dono (valem acima das regras gerais)\n${opts.extras}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: PROMPT, cache_control: CACHE_1H },
    ...(fixo ? [{ type: "text" as const, text: fixo, cache_control: CACHE_1H }] : []),
    {
      type: "text",
      text: [
        `# Agora\n${agoraSP()} (horário de Brasília).`,
        `# Horários livres pra call (horário de Brasília)\n${
          opts.especialista
            ? `${opts.especialista} é o especialista deste lead (já tem call marcada ou já conversou com ele): a call é sempre com ${opts.especialista}, inclusive pra remarcar. Os horários abaixo já são só dessa pessoa. Nunca ofereça outro especialista; se nenhum horário servir, chame passar_para_humano (motivo call).\n`
            : ""
        }${
          opts.horariosLivres.length ? opts.horariosLivres.join(", ") : "nenhum no momento: pergunte dia e período e passe pro time"
        }`,
        blocoLead(opts.lead),
        opts.avisoDoLead ? `# Sobre este lead (vale junto com os ajustes do dono)\n${opts.avisoDoLead}` : null,
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
      : opts.retomar
  );

  let humano: ResultadoTeo["humano"] = null;
  const notas: string[] = [];
  // Se um modelo sumir (404), cai pro próximo da lista.
  const modelos = [...new Set(opts.acompanhamento ? [MODEL_ACOMPANHAMENTO, MODEL, FALLBACK_MODEL] : [MODEL, FALLBACK_MODEL])];
  let m = 0;
  const uso: UsoTeo = { modelo: modelos[0], chamadas: 0, entrada: 0, cache_lido: 0, cache_gravado: 0, saida: 0 };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let resp: Anthropic.Message;
    try {
      resp = await client.messages.create({
        model: modelos[m],
        max_tokens: 4096,
        system,
        tools: TOOLS,
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
        // Cache automático do fim da conversa (5 min): quando o Téo usa uma
        // ferramenta e volta, a segunda chamada lê o histórico do cache.
        cache_control: { type: "ephemeral" },
      });
    } catch (e) {
      if (e instanceof Anthropic.NotFoundError && m < modelos.length - 1) {
        m++;
        uso.modelo = modelos[m];
        turn--;
        continue;
      }
      throw e;
    }
    uso.chamadas++;
    uso.entrada += resp.usage.input_tokens;
    uso.cache_lido += resp.usage.cache_read_input_tokens ?? 0;
    uso.cache_gravado += resp.usage.cache_creation_input_tokens ?? 0;
    uso.saida += resp.usage.output_tokens;

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
        } else if (b.name === "pedir_cupom") {
          const out = opts.pedirCupom
            ? await opts.pedirCupom({ codigo: input.codigo ?? "", motivo: input.motivo ?? "" })
            : "Cupom não está liberado pra este lead: siga com o preço da tabela.";
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
      encerrar: /\[ENCERRAR\]/i.test(texto),
      humano,
      ficha: notas.length ? notas.join("\n") : null,
      uso,
    };
  }
  return { mensagens: [], humano, ficha: notas.length ? notas.join("\n") : null, uso };
}
