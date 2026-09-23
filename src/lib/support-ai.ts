// Cérebro de IA do suporte (Fase 2).
//
// Dada a mensagem de um cliente (e o histórico da conversa), a IA:
//   - consulta o cliente 360 no banco (ferramenta lookup_customer)
//   - responde com base na base de conhecimento (treinamento)
//   - conduz procedimentos guiados e ESCALA pra fila humana quando precisa de
//     ação financeira/de conta (ferramenta create_handoff)
//   - encaminha leads (não clientes) pro comercial
//
// Usa o SDK oficial da Anthropic (Claude). Sem ANTHROPIC_API_KEY, fica
// "desligada" e quem chama trata o fallback.

import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { findCustomer, blocoLabel, KB_BLOCOS, type KbItem } from "@/lib/support";

// Modelo padrão: Claude Opus 5.5 — mais novo e 20% mais barato que o 4.8
// ($4/$20 por milhão contra $5/$25; leitura de cache $0,20 contra $0,50).
// Configurável por env. Se a conta ainda não tiver o modelo liberado (404),
// a chamada cai sozinha pro FALLBACK_MODEL e registra no webhook_log.
const MODEL = process.env.SUPPORT_AI_MODEL || "claude-opus-5-5";
const FALLBACK_MODEL = "claude-opus-4-8";
const EFFORT = process.env.SUPPORT_AI_EFFORT || "medium";
const SALES_CONTACT =
  process.env.SUPPORT_SALES_CONTACT || "+55 11 92507-2167";
const MAX_TURNS = 6;

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentResult {
  reply: string;
  messages: string[];
  escalated: boolean;
  handoffId: string | null;
  usedTools: string[];
}

// A IA pode separar a resposta em várias mensagens curtas (como no WhatsApp)
// usando uma linha só com [BREAK]. Aqui quebramos nesse marcador.
function splitMessages(reply: string): string[] {
  const parts = reply
    .split(/\n*\[BREAK\]\n*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [reply.trim() || "(sem resposta)"];
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Nome do modelo da IA em uso (para exibir na tela).
export function supportModelName(): string {
  return MODEL;
}

const HANDOFF_MOTIVOS = [
  "cancelamento_renovacao",
  "reembolso",
  "divergencia_pagamento",
  "brinde_nao_recebido",
  "resgate_bf",
  "duvida_acesso",
  "lead_comercial",
  "outro",
];

async function buildSystemPrompt(): Promise<string> {
  const admin = getSupabaseAdmin();
  let kb: KbItem[] = [];
  if (admin) {
    const { data } = await admin
      .from("support_kb")
      .select("id,bloco,titulo,conteudo,ativo,ordem,updated_at,valido_ate")
      .eq("ativo", true)
      .order("bloco", { ascending: true })
      .order("ordem", { ascending: true });
    // Ignora itens vencidos (valido_ate < hoje) — ex.: dados de um evento já
    // passado deixam de ser usados pela IA automaticamente.
    const hoje = new Date().toISOString().slice(0, 10);
    kb = ((data ?? []) as KbItem[]).filter((it) => !it.valido_ate || it.valido_ate >= hoje);
  }

  const blocos = new Map<string, KbItem[]>();
  for (const item of kb) {
    const list = blocos.get(item.bloco) ?? [];
    list.push(item);
    blocos.set(item.bloco, list);
  }
  let baseConhecimento = "";
  for (const [bloco, itens] of blocos) {
    baseConhecimento += `\n## ${blocoLabel(bloco)}\n`;
    for (const it of itens) {
      baseConhecimento += `\n### ${it.titulo}\n${it.conteudo}\n`;
    }
  }
  if (!baseConhecimento) {
    baseConhecimento =
      "\n(A base de conhecimento ainda está vazia. Responda com cautela e escale o que não souber.)\n";
  }

  return `Você é o atendente de SUPORTE pós-venda do Canal do Anfitrião, no WhatsApp.
Seu papel é resolver dúvidas de quem JÁ é cliente (comprou). Você NÃO faz vendas.

# Regras de ouro (inegociáveis)
1. Entenda primeiro o que a pessoa quer. Quando precisar consultar, identifique com lookup_customer usando o que ela tiver (e-mail, CPF ou nome). Antes de reembolso, cancelamento, pausa ou alteração, confirme a identidade (detalhes na base, em "Localizar e confirmar o cliente"). Nunca invente dados.
2. Você nunca altera dados cadastrais: coleta o que precisa mudar e escala pro time.
3. Você é pós-venda. Quem quer COMPRAR é encaminhado ao comercial: ${SALES_CONTACT}.
4. Responda em português, de forma curta, cordial e objetiva, como no WhatsApp.
5. Como no WhatsApp, NÃO mande um textão. Quando a resposta tiver mais de uma ideia, divida em mensagens curtas: ponha uma linha contendo apenas [BREAK] entre cada mensagem (no máximo 3). Cumprimento não é uma ideia separada: vai junto da primeira frase útil. Se uma frase só já resolve, não use [BREAK].
6. Em conflito entre regras da base, vale a mais específica para o caso.

# Quem é quem
- É CLIENTE (lookup mostra compra confirmada): dê suporte completo.
- NÃO é cliente / e-mail não encontrado: tire dúvidas básicas e encaminhe ao comercial (${SALES_CONTACT}) usando o motivo "lead_comercial" se precisar registrar.

# Até onde você resolve sozinho (modo autônomo)
Você conduz procedimentos guiados passo a passo (ex.: orientar o cancelamento, coletar o endereço do brinde, explicar a renovação) e SÓ então escala — já com tudo coletado. Use create_handoff para abrir um caso na fila humana quando a conclusão exigir AÇÃO interna nossa: cancelamento de renovação, reembolso, divergência/cashback de pagamento, brinde não recebido (com endereço coletado), transferência de ingresso, ou qualquer alteração que dependa de um humano. Antes de escalar, colete e resuma tudo no campo "resumo" (cliente, e-mail, pedido, o que já foi coletado, ação necessária).
Dúvidas de INFORMAÇÃO/consulta (valores, datas, acesso, validade, "estou inadimplente?", "minha renovação está ativa?") você responde sozinho usando o lookup e a base de conhecimento, sem escalar. Quando a compra no lookup já trouxer "dataReembolso", informe essa data diretamente ao cliente — só escale por causa da data do estorno se esse campo vier vazio.

# Base de conhecimento (seu treinamento)
${baseConhecimento}`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "lookup_customer",
    description:
      "Busca o cliente por e-mail, CPF OU nome. Prefira e-mail; se o cliente não souber o e-mail, busque por CPF (basta o CPF, não precisa do e-mail exato). Use SEMPRE antes de responder dúvidas que dependem da situação da pessoa (acesso, pagamento, inadimplência, validade, renovação). Se a busca por nome retornar vários cadastros, peça o CPF. Retorna se é cliente, o que comprou, status da assinatura e se está inadimplente.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string", description: "e-mail cadastrado na compra" },
        cpf: { type: "string", description: "CPF do cliente (com ou sem pontuação)" },
        nome: { type: "string", description: "nome completo (use só quando não há e-mail nem CPF)" },
      },
    },
  },
  {
    name: "create_handoff",
    description:
      "Abre um caso na fila de atendimento humano quando a conclusão exige ação interna (cancelamento de renovação, reembolso, divergência/cashback, brinde não recebido, transferência de ingresso, alteração de dados) ou para encaminhar um lead ao comercial. Colete o máximo de informação ANTES de escalar. Chame UMA vez por caso: se você já registrou este caso na conversa, não chame de novo — apenas confirme ao cliente que está registrado.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", enum: HANDOFF_MOTIVOS },
        resumo: {
          type: "string",
          description:
            "Resumo do caso para o humano: cliente, e-mail, pedido, o que já foi coletado e a ação necessária.",
        },
        email: { type: "string" },
        nome: { type: "string" },
        telefone: { type: "string" },
        dados_coletados: {
          type: "object",
          description: "Dados estruturados coletados (ex.: endereço do brinde).",
        },
      },
      required: ["motivo", "resumo"],
    },
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runTool(name: string, input: any): Promise<{ text: string; handoffId?: string }> {
  if (name === "lookup_customer") {
    const result = await findCustomer({
      email: input?.email ? String(input.email) : undefined,
      cpf: input?.cpf ? String(input.cpf) : undefined,
      nome: input?.nome ? String(input.nome) : undefined,
    });
    return { text: JSON.stringify(result) };
  }
  if (name === "create_handoff") {
    const admin = getSupabaseAdmin();
    if (!admin) return { text: JSON.stringify({ error: "sem banco" }) };
    const motivo = HANDOFF_MOTIVOS.includes(String(input?.motivo))
      ? String(input.motivo)
      : "outro";
    const email = input?.email ? String(input.email) : null;
    const telefone = input?.telefone ? String(input.telefone) : null;

    // Trava anti-duplicata. Cada mensagem do cliente roda o agente de novo, e
    // um "ta bom"/"obrigado" depois da escalada fazia o modelo registrar o
    // MESMO caso outra vez (o histórico que ele relê só tem os textos, não as
    // chamadas de ferramenta). Caso não-resolvido recente, do mesmo motivo,
    // pro mesmo contato = mesmo caso: devolve o existente em vez de criar.
    const contato: string[] = [];
    if (telefone) contato.push(`telefone.eq.${telefone}`);
    if (email) contato.push(`email.eq.${email}`);
    if (contato.length > 0) {
      const desde = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const { data: aberto } = await admin
        .from("support_handoffs")
        .select("id")
        .eq("motivo", motivo)
        .neq("status", "resolvido")
        .gte("created_at", desde)
        .or(contato.join(","))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (aberto) {
        return {
          text: JSON.stringify({
            ok: true,
            id: aberto.id,
            ja_existia: true,
            aviso:
              "Este cliente já tem um caso aberto com esse motivo — não criei outro. Apenas confirme ao cliente que está registrado.",
          }),
          handoffId: aberto.id,
        };
      }
    }

    const { data, error } = await admin
      .from("support_handoffs")
      .insert({
        motivo,
        resumo: input?.resumo ? String(input.resumo) : null,
        email,
        nome: input?.nome ? String(input.nome) : null,
        telefone,
        dados_coletados: input?.dados_coletados ?? null,
      })
      .select("id")
      .single();
    if (error) return { text: JSON.stringify({ error: error.message }) };
    return {
      text: JSON.stringify({ ok: true, id: data?.id }),
      handoffId: data?.id,
    };
  }
  return { text: JSON.stringify({ error: `ferramenta desconhecida: ${name}` }) };
}

/** Imagem que veio junto da mensagem do cliente (print de erro, comprovante…). */
async function registrarFallback(modelo: string, erro: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin.from("webhook_log").insert({
    source: "support_ai",
    note: `ERRO: modelo ${modelo} indisponível — respondendo com ${FALLBACK_MODEL}`,
    body: { erro: erro.slice(0, 500) },
  });
}

export interface AgentImage {
  /** image/jpeg, image/png, image/webp ou image/gif — o que a API aceita. */
  mime: string;
  /** Conteúdo em base64, sem o prefixo data:. */
  base64: string;
}

export async function runSupportAgent(
  message: string,
  history: AgentMessage[] = [],
  supervisorNotes: string[] = [],
  images: AgentImage[] = []
): Promise<AgentResult> {
  if (!aiConfigured()) {
    const off = "A IA de suporte ainda não está ligada (falta a ANTHROPIC_API_KEY no servidor).";
    return { reply: off, messages: [off], escalated: false, handoffId: null, usedTools: [] };
  }

  const client = new Anthropic();
  let system = await buildSystemPrompt();
  if (supervisorNotes.length > 0) {
    // Canal do "chefe" (modo treino): instruções de operador que o cliente não
    // vê e que a IA deve obedecer acima de tudo nesta conversa.
    system +=
      "\n\n# Instruções do supervisor (sessão de treino — obedeça acima de tudo)\n" +
      supervisorNotes.map((n, i) => `${i + 1}. ${n}`).join("\n");
  }

  // O cliente manda print o tempo todo (tela de erro da Eduzz, comprovante,
  // cobrança que não reconhece). Antes qualquer anexo pulava a IA e ia direto
  // pro humano; agora a imagem vai junto da mensagem e ela lê o que está ali.
  const conteudoAtual: Anthropic.ContentBlockParam[] =
    images.length > 0
      ? [
          ...images.map(
            (img): Anthropic.ContentBlockParam => ({
              type: "image",
              source: { type: "base64", media_type: img.mime as "image/jpeg", data: img.base64 },
            })
          ),
          { type: "text", text: message || "(o cliente mandou esta imagem sem escrever nada)" },
        ]
      : [{ type: "text", text: message }];

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: conteudoAtual },
  ];

  const usedTools: string[] = [];
  let handoffId: string | null = null;

  // adaptive thinking + effort só existem em parte da família (Opus 4.6+/Sonnet
  // 4.6/família 5). No Haiku 4.5 esses parâmetros dão 400, então omitimos.
  // No Opus 5.5 o thinking nem desliga — adaptativo é o único modo.
  const ADAPTIVE_MODELS = new Set([
    "claude-opus-5-5",
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-fable-5-1",
    "claude-fable-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
  ]);

  // Cache de prompt: ferramentas + sistema (a base de conhecimento inteira,
  // ~11k tokens) são idênticos em toda chamada. Com o breakpoint no fim do
  // sistema, tudo até aqui é lido do cache a 5% do preço. TTL de 1h porque o
  // cliente responde em minutos, não em segundos — com 5 min o cache expirava
  // entre uma mensagem e outra e a gravação custava mais do que a leitura
  // poupava. Sem isso a Lia pagava os 11k tokens cheios a cada mensagem.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: system, cache_control: { type: "ephemeral", ttl: "1h" } },
  ];

  let model = MODEL;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        // o thinking conta dentro do max_tokens; 4096 apertava com ele ligado
        max_tokens: 8192,
        system: systemBlocks,
        tools: TOOLS,
        messages,
        ...(ADAPTIVE_MODELS.has(model)
          ? {
              thinking: { type: "adaptive" as const },
              output_config: { effort: EFFORT as "low" | "medium" | "high" },
            }
          : {}),
      });
    } catch (e) {
      // Modelo ainda não liberado pra esta conta: cai pro anterior em vez de
      // deixar o cliente sem resposta, e deixa registrado pra alguém ver.
      if (e instanceof Anthropic.NotFoundError && model !== FALLBACK_MODEL) {
        await registrarFallback(model, e.message);
        model = FALLBACK_MODEL;
        turn--;
        continue;
      }
      throw e;
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          usedTools.push(block.name);
          const out = await runTool(block.name, block.input);
          if (out.handoffId) handoffId = out.handoffId;
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: out.text,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const parts = splitMessages(reply);
    return {
      reply: parts.join("\n\n"),
      messages: parts,
      escalated: handoffId !== null,
      handoffId,
      usedTools,
    };
  }

  const fail = "Não consegui concluir o atendimento automático. Vou encaminhar para um humano.";
  return {
    reply: fail,
    messages: [fail],
    escalated: handoffId !== null,
    handoffId,
    usedTools,
  };
}

export interface RuleSuggestion {
  /** Preenchido quando a correção cabe numa regra que já existe: salvar atualiza ela. */
  id?: string;
  acao: "editar" | "nova";
  bloco: string;
  titulo: string;
  conteudo: string;
  ordem?: number;
  valido_ate?: string | null;
  /** Texto atual da regra que será substituída (pra mostrar o antes/depois). */
  anterior?: { titulo: string; conteudo: string };
  /** Uma frase explicando por que editar essa regra ou criar uma nova. */
  motivo?: string;
}

// Transforma uma correção do "chefe" (modo treino) numa mudança no treinamento.
//
// Antes, toda correção virava uma regra NOVA sem olhar as existentes. Em três
// meses a base chegou a 49 regras com três de tom se contradizendo, prazo de
// reembolso em três versões e a mesma regra de CPF repetida cinco vezes, e a
// IA resolvia os conflitos do jeito que dava na hora. Agora o modelo lê a
// base ativa e prefere REESCREVER a regra que já cobre o assunto, incorporando
// a correção e tirando o que ela contradiz. Regra nova só se o assunto não
// existe em lugar nenhum.
export async function suggestRule(
  note: string,
  context?: { customerMessage?: string; aiReply?: string }
): Promise<RuleSuggestion> {
  const fallback: RuleSuggestion = {
    acao: "nova",
    bloco: "regras_ouro",
    titulo: note.slice(0, 80),
    conteudo: note,
  };
  if (!aiConfigured()) return fallback;

  const admin = getSupabaseAdmin();
  let regras: KbItem[] = [];
  if (admin) {
    const { data } = await admin
      .from("support_kb")
      .select("id,bloco,titulo,conteudo,ativo,ordem,updated_at,valido_ate")
      .eq("ativo", true)
      .order("bloco", { ascending: true })
      .order("ordem", { ascending: true });
    regras = (data ?? []) as KbItem[];
  }
  const porId = new Map(regras.map((r) => [r.id, r]));
  const base = regras
    .map((r) => `<regra id="${r.id}" bloco="${r.bloco}">\n# ${r.titulo}\n${r.conteudo}\n</regra>`)
    .join("\n\n");

  const client = new Anthropic();
  const blocos = KB_BLOCOS.map((b) => `${b.key} (${b.label})`).join(", ");
  const sys = `Você mantém a base de treinamento do atendente de IA do suporte. O supervisor (o "chefe") corrigiu uma resposta, e você transforma essa correção numa mudança na base.

A base é lida inteira pelo atendente em todo atendimento. Regras repetidas ou contraditórias fazem ele agir de forma inconsistente, então a base tem que continuar enxuta e coerente.

Decida:
- "editar": a correção é sobre um assunto que alguma regra já cobre (mesmo que de outro ângulo). Reescreva ESSA regra inteira incorporando a correção. Mantenha tudo que continua valendo, remova ou ajuste o que a correção contradiz, não duplique informação que já está em outra regra. É o caminho preferido.
- "nova": nenhuma regra trata do assunto. Crie uma regra curta.

Responda SOMENTE com JSON:
{"acao":"editar"|"nova","id":"<id da regra, só se editar>","bloco":"...","titulo":"...","conteudo":"<texto completo da regra>","motivo":"<uma frase: por que editar essa regra, ou por que nenhuma cobria>"}

Regras de escrita:
- bloco: uma destas chaves: ${blocos}.
- titulo: curto, descrevendo a situação.
- conteudo: instrução no imperativo, clara e objetiva, que vale pra TODOS os atendimentos. Ao editar, devolva o texto COMPLETO da regra, não só o trecho novo.
- Não invente fatos (preço, link, prazo, contato). Se a correção depende de um dado que não está na base, escreva a regra mandando o atendente escalar pro time (create_handoff) nesse caso. Nunca escreva [PREENCHER] nem variáveis entre chaves.
- Não use travessão (—).`;

  const ctx = [
    "<base_atual>",
    base || "(base vazia)",
    "</base_atual>",
    "",
    context?.customerMessage ? `Mensagem do cliente: ${context.customerMessage}` : "",
    context?.aiReply ? `Resposta que a IA deu: ${context.aiReply}` : "",
    `Correção do chefe: ${note}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  try {
    const res = await client.messages.create({
      model: MODEL,
      // ao editar, a regra inteira volta reescrita (o mapa de materiais tem ~3k chars)
      max_tokens: 8192,
      system: sys,
      messages: [{ role: "user", content: ctx }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const json = JSON.parse(match[0]);
    const blocoOk = KB_BLOCOS.some((b) => b.key === json.bloco);
    const conteudo = String(json.conteudo ?? note);
    const titulo = String(json.titulo ?? note).slice(0, 200);
    const motivo = json.motivo ? String(json.motivo) : undefined;

    // Só edita se o id é de uma regra ativa de verdade; id inventado vira regra nova.
    const alvo = json.acao === "editar" && json.id ? porId.get(String(json.id)) : undefined;
    if (alvo) {
      return {
        acao: "editar",
        id: alvo.id,
        bloco: blocoOk ? json.bloco : alvo.bloco,
        titulo,
        conteudo,
        ordem: alvo.ordem,
        valido_ate: alvo.valido_ate ?? null,
        anterior: { titulo: alvo.titulo, conteudo: alvo.conteudo },
        motivo,
      };
    }
    return {
      acao: "nova",
      bloco: blocoOk ? json.bloco : "regras_ouro",
      titulo,
      conteudo,
      motivo,
    };
  } catch {
    return fallback;
  }
}
