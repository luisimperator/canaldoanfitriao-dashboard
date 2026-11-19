import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anotar } from "@/lib/teo";

// Nota de próximo passo pro vendedor depois de cada call (Fernando, 18/11:
// "pode mandar agora e mandar sempre"). Quando a transcrição de uma call do
// Téo fica pronta (call_transcricoes.status = 'ok'), o Claude lê a call com a
// ficha do Téo e a tabela de preços e deixa uma nota interna na conversa do
// lead no Unnichat: como terminou, o próximo passo concreto, os erros de
// informação do vendedor e uma dica. Uma vez por call (nota_vendedor_em).
// A nota nunca começa com "#" (a nota "#call"/"#faltou" marca presença).

const MODEL = process.env.CALLS_FEEDBACK_MODEL || "claude-opus-5-5";
// Só calls transcritas nas últimas 24h (não reprocessa o acervo antigo).
const JANELA_MS = 24 * 3600_000;
// Abaixo disso a transcrição é sala vazia ou só "e aí" (a presença cuida).
const MIN_CARACTERES = 1500;
const POR_RODADA = 2;

// Fatos da Black (até teo_config.black_ate). Mesma fonte do bloco da Black do
// Téo (src/app/api/sync/teo/route.ts): se mudar lá, mude aqui.
const FATOS_BLACK = [
  "Black Friday (combo vitalício), até o fim da campanha:",
  "- Aluno ou ex-aluno (inclui quem é/foi do Gigantes, fez imersão ou foi a Encontro): R$ 4.997 à vista ou 12x de R$ 499,70. Não aluno: R$ 8.997 ou 12x de R$ 899,71.",
  "- Inclui: Anfitrião 5 Estrelas, Gigantes, Sublocação, Booking, Decoração e Fotografia vitalícios; 4 anos das comunidades (Anfitrião 5 Estrelas e Gigantes) com o Max (assistente de IA) junto; 1 ingresso Standard do Encontro 2027 (pros 100 primeiros) — o 2º ingresso sai com 20% de desconto (Fernando, 18/11: é 1 ingresso, não 2).",
  "- Garantia da Black: 7 dias. Dividir em 2 cartões: só na Black e na Renovação.",
  "- Pra aluno, a conta que vende: renovar o Anfitrião 5 Estrelas custa R$ 997/ano (4 anos = R$ 3.988); na Black o curso fica vitalício, com as duas comunidades por 4 anos, o Max e o ingresso.",
].join("\n");

// Ingresso do Encontro: o 2º com 20% vale em qualquer compra de ingresso
// (Fernando, 19/11: "O ingresso de 20% pro acompanhante é padrão, não é só
// pra Black").
const FATOS_ENCONTRO = [
  "- Ingresso Standard: R$ 997, vale os 2 dias do evento.",
  "- O 2º ingresso (acompanhante) sai com 20% de desconto: é padrão em qualquer compra de ingresso, não só na Black.",
].join("\n");

const SISTEMA = `Você é o coach de vendas do Canal do Anfitrião (cursos de Airbnb do Rômulo Villela). Lê a transcrição de uma call de vendas de 20-40 min entre um especialista (vendedor) e um lead e escreve UMA nota interna curta pro vendedor, que ele lê na conversa do lead no WhatsApp (Unnichat) antes do próximo contato.

Formato (texto puro, sem markdown, sem títulos, nunca comece com "#"):
📋 Próximo passo (análise da call de DIA às HORA, VENDEDOR)
• Como terminou: 1 linha (o que o lead quer/sente e onde parou: "vou pensar", "cartão vira dia X", "achou caro", etc.).
• Próximo passo: o que mandar, quando (dia e hora) e com qual preço/condição da tabela. Se o lead disse sim ou pediu pra fechar, é link de pagamento hoje.
• Correções (só se houver): o que o vendedor disse de errado pro lead e o certo, pela tabela (preço, parcela, garantia, ingresso, boleto, cartões, promessa de resultado).
• Dica: 1 coisa pra fazer melhor na próxima call (devolver o problema nas palavras do lead, citar a garantia junto com o preço, mandar o link na call, marcar dia e hora do retorno, não dar desconto sem tratar o "caro", não desqualificar o lead).
No máximo 6 linhas, até 900 caracteres. Português do Brasil, direto, de colega pra colega. Use só o primeiro nome do lead.

Regras:
- Preços, parcelas, garantias e condições: só os da tabela abaixo. Nunca invente nem sugira desconto fora da escada de cupons.
- Não cite faturamento, patrimônio nem estrutura societária do Rômulo/empresa.
- Se a call não aconteceu de verdade (sala vazia, lead não apareceu, só cumprimento) responda exatamente [SEM_CALL].`;

type Linha = {
  join_url: string;
  teo_call_id: string;
  transcricao: string | null;
  inicio: string | null;
};

function quando(iso: string | null): { dia: string; hora: string } {
  if (!iso) return { dia: "?", hora: "?" };
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const hora = d
    .toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    .replace(":00", "h")
    .replace(":", "h");
  return { dia, hora };
}

// Tabela de preços, Black (enquanto teo_config.black_ate não passou) e a
// escada de cupons, como o Claude lê nas análises de call. Também usada pelo
// feedback privado do vendedor (src/lib/calls-feedback-vendedor.ts).
export async function tabelaDePrecos(supabase: SupabaseClient): Promise<string> {
  const { data: cfg } = await supabase.from("teo_config").select("precos, cupons, black_ate").eq("id", 1).maybeSingle();
  const blackAtiva = cfg?.black_ate ? new Date(cfg.black_ate as string).getTime() > Date.now() : false;
  const cupons = ((cfg?.cupons ?? []) as { produto: string; degrau: number; condicao: string; quando: string }[])
    .map((c) => `- ${c.produto}, degrau ${c.degrau}: ${c.condicao} (só quando: ${c.quando})`)
    .join("\n");
  return [
    `# Tabela de preços e condições\n${(cfg?.precos as string | null) ?? ""}`,
    blackAtiva ? `# Black\n${FATOS_BLACK}` : null,
    `# Encontro 2027 (ingresso)\n${FATOS_ENCONTRO}`,
    cupons ? `# Escada de desconto (cupons; um degrau por vez, só depois de tratar o "caro")\n${cupons}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function notasPosCall(
  supabase: SupabaseClient,
  inicioRodada: number,
  limiteMs: number,
  log: (note: string, body: Record<string, unknown>) => Promise<void>
): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  const { data } = await supabase
    .from("call_transcricoes")
    .select("join_url, teo_call_id, transcricao, inicio")
    .eq("status", "ok")
    .not("teo_call_id", "is", null)
    .is("nota_vendedor_em", null)
    .gte("transcrito_em", new Date(Date.now() - JANELA_MS).toISOString())
    .order("transcrito_em")
    .limit(POR_RODADA);
  const linhas = (data ?? []) as Linha[];
  if (!linhas.length) return [];

  const tabela = await tabelaDePrecos(supabase);

  const client = new Anthropic();
  const feitos: string[] = [];
  for (const l of linhas) {
    if (Date.now() - inicioRodada > limiteMs) break;
    const marcar = (extra: Record<string, unknown> = {}) =>
      supabase
        .from("call_transcricoes")
        .update({ nota_vendedor_em: new Date().toISOString(), ...extra })
        .eq("join_url", l.join_url);
    const { data: k } = await supabase
      .from("teo_calls")
      .select("contact_id, nome, vendedor, resumo, inicio")
      .eq("id", l.teo_call_id)
      .maybeSingle();
    const texto = l.transcricao ?? "";
    if (!k?.contact_id || texto.length < MIN_CARACTERES) {
      await marcar();
      continue;
    }
    const { dia, hora } = quando((k.inicio as string | null) ?? l.inicio);
    const vendedor = ((k.vendedor as string | null) ?? "").trim().split(/\s+/)[0] || "especialista";
    const lead = ((k.nome as string | null) ?? "").trim().split(/\s+/)[0] || "lead";
    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        system: [
          { type: "text", text: SISTEMA },
          { type: "text", text: tabela, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content: `Call de ${dia} às ${hora}. Vendedor: ${vendedor}. Lead: ${lead}.\n\nFicha que o Téo (pré-vendedor no WhatsApp) passou antes da call:\n${(k.resumo as string | null) ?? "(sem ficha)"}\n\nTranscrição (pode ter ruído e palavras soltas em inglês):\n${texto.slice(0, 120_000)}`,
          },
        ],
      });
      const nota = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim()
        .replace(/^#+\s*/, "");
      if (!nota || nota.includes("[SEM_CALL]")) {
        await marcar();
        await log("nota pós-call: call não aconteceu", { teo_call_id: l.teo_call_id, nome: k.nome });
        continue;
      }
      await anotar(supabase, k.contact_id as string, nota.slice(0, 1800));
      await marcar();
      await log("nota pós-call enviada", {
        teo_call_id: l.teo_call_id,
        nome: k.nome,
        vendedor: k.vendedor,
        entrada: resp.usage.input_tokens,
        saida: resp.usage.output_tokens,
      });
      feitos.push(`${lead} (${vendedor})`);
    } catch (e) {
      // Não tenta de novo a cada 30 min (custo): marca e registra o erro.
      await marcar();
      await log("ERRO: nota pós-call", {
        teo_call_id: l.teo_call_id,
        erro: e instanceof Error ? e.message.slice(0, 300) : String(e),
      });
    }
  }
  return feitos;
}
