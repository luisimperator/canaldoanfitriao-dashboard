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
import { getCustomer360, blocoLabel, KB_BLOCOS, type KbItem } from "@/lib/support";

// Modelo padrão: Claude Opus 4.8. Configurável por env para trocar por
// claude-haiku-4-5 / claude-sonnet-4-6 se quiser reduzir custo/latência.
const MODEL = process.env.SUPPORT_AI_MODEL || "claude-opus-4-8";
const EFFORT = process.env.SUPPORT_AI_EFFORT || "medium";
const SALES_CONTACT =
  process.env.SUPPORT_SALES_CONTACT || "+55 11 98763-7146";
const MAX_TURNS = 6;

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentResult {
  reply: string;
  escalated: boolean;
  handoffId: string | null;
  usedTools: string[];
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
      .select("id,bloco,titulo,conteudo,ativo,ordem,updated_at")
      .eq("ativo", true)
      .order("bloco", { ascending: true })
      .order("ordem", { ascending: true });
    kb = (data ?? []) as KbItem[];
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
1. SEMPRE peça o e-mail cadastrado na compra antes de consultar ou agir, e use a ferramenta lookup_customer para confirmar a situação real da pessoa no banco. Nunca invente dados.
2. Alteração de dados cadastrais é SEMPRE pelo formulário que o próprio cliente preenche — você nunca altera dados aqui.
3. Você é pós-venda. Quem quer COMPRAR é encaminhado ao comercial: ${SALES_CONTACT}.
4. Responda em português, de forma curta, cordial e objetiva, como no WhatsApp.

# Quem é quem
- É CLIENTE (lookup mostra compra confirmada): dê suporte completo.
- NÃO é cliente / e-mail não encontrado: tire dúvidas básicas e encaminhe ao comercial (${SALES_CONTACT}) usando o motivo "lead_comercial" se precisar registrar.

# Até onde você resolve sozinho (modo autônomo)
Você conduz procedimentos guiados passo a passo (ex.: orientar o cancelamento, coletar o endereço do brinde, explicar a renovação) e SÓ então escala — já com tudo coletado. Use create_handoff para abrir um caso na fila humana quando a conclusão exigir AÇÃO interna nossa: cancelamento de renovação, reembolso, divergência/cashback de pagamento, brinde não recebido (com endereço coletado), transferência de ingresso, ou qualquer alteração que dependa de um humano. Antes de escalar, colete e resuma tudo no campo "resumo" (cliente, e-mail, pedido, o que já foi coletado, ação necessária).
Dúvidas de INFORMAÇÃO/consulta (valores, datas, acesso, validade, "estou inadimplente?", "minha renovação está ativa?") você responde sozinho usando o lookup e a base de conhecimento, sem escalar.

# Base de conhecimento (seu treinamento)
${baseConhecimento}`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "lookup_customer",
    description:
      "Busca o cliente pelo e-mail cadastrado na compra. Use SEMPRE antes de responder dúvidas que dependem da situação da pessoa (acesso, pagamento, inadimplência, validade do acesso, renovação/assinatura). Retorna se é cliente, o que comprou, status da assinatura e se está inadimplente.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string", description: "e-mail cadastrado na compra" },
      },
      required: ["email"],
    },
  },
  {
    name: "create_handoff",
    description:
      "Abre um caso na fila de atendimento humano quando a conclusão exige ação interna (cancelamento de renovação, reembolso, divergência/cashback, brinde não recebido, transferência de ingresso, alteração de dados) ou para encaminhar um lead ao comercial. Colete o máximo de informação ANTES de escalar.",
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
    const result = await getCustomer360(String(input?.email ?? ""));
    return { text: JSON.stringify(result) };
  }
  if (name === "create_handoff") {
    const admin = getSupabaseAdmin();
    if (!admin) return { text: JSON.stringify({ error: "sem banco" }) };
    const motivo = HANDOFF_MOTIVOS.includes(String(input?.motivo))
      ? String(input.motivo)
      : "outro";
    const { data, error } = await admin
      .from("support_handoffs")
      .insert({
        motivo,
        resumo: input?.resumo ? String(input.resumo) : null,
        email: input?.email ? String(input.email) : null,
        nome: input?.nome ? String(input.nome) : null,
        telefone: input?.telefone ? String(input.telefone) : null,
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

export async function runSupportAgent(
  message: string,
  history: AgentMessage[] = [],
  supervisorNotes: string[] = []
): Promise<AgentResult> {
  if (!aiConfigured()) {
    return {
      reply:
        "A IA de suporte ainda não está ligada (falta a ANTHROPIC_API_KEY no servidor).",
      escalated: false,
      handoffId: null,
      usedTools: [],
    };
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

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  const usedTools: string[] = [];
  let handoffId: string | null = null;

  // adaptive thinking + effort só existem em parte da família (Opus 4.6+/Sonnet
  // 4.6/Fable 5). No Haiku 4.5 esses parâmetros dão 400, então omitimos.
  const ADAPTIVE_MODELS = new Set([
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-fable-5",
  ]);
  const useAdaptive = ADAPTIVE_MODELS.has(MODEL);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      tools: TOOLS,
      messages,
      ...(useAdaptive
        ? {
            thinking: { type: "adaptive" as const },
            output_config: { effort: EFFORT as "low" | "medium" | "high" },
          }
        : {}),
    });

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

    return {
      reply: reply || "(sem resposta)",
      escalated: handoffId !== null,
      handoffId,
      usedTools,
    };
  }

  return {
    reply:
      "Não consegui concluir o atendimento automático. Vou encaminhar para um humano.",
    escalated: handoffId !== null,
    handoffId,
    usedTools,
  };
}

export interface RuleSuggestion {
  bloco: string;
  titulo: string;
  conteudo: string;
}

// Transforma uma correção do "chefe" (modo treino) numa regra permanente,
// limpa e pronta pra salvar no treinamento. Devolve {bloco, titulo, conteudo}.
export async function suggestRule(
  note: string,
  context?: { customerMessage?: string; aiReply?: string }
): Promise<RuleSuggestion> {
  const fallback: RuleSuggestion = {
    bloco: "regras_ouro",
    titulo: note.slice(0, 80),
    conteudo: note,
  };
  if (!aiConfigured()) return fallback;

  const client = new Anthropic();
  const blocos = KB_BLOCOS.map((b) => `${b.key} (${b.label})`).join(", ");
  const sys = `Você ajuda a transformar uma correção do supervisor (o "chefe" do atendente de IA) em UMA regra permanente para o treinamento do suporte. Responda SOMENTE com JSON: {"bloco":"...","titulo":"...","conteudo":"..."}.
- bloco: escolha exatamente uma destas chaves: ${blocos}.
- titulo: curto, descrevendo a situação a que a regra se aplica.
- conteudo: a instrução pronta, no imperativo, clara e objetiva, que a IA seguirá em TODOS os atendimentos.
- Não invente fatos (preços, links, prazos): se faltar, escreva [PREENCHER].`;
  const ctx = [
    context?.customerMessage ? `Mensagem do cliente: ${context.customerMessage}` : "",
    context?.aiReply ? `Resposta que a IA deu: ${context.aiReply}` : "",
    `Correção do chefe: ${note}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
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
    return {
      bloco: blocoOk ? json.bloco : "regras_ouro",
      titulo: String(json.titulo ?? note).slice(0, 200),
      conteudo: String(json.conteudo ?? note),
    };
  } catch {
    return fallback;
  }
}
