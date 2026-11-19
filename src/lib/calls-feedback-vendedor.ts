import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { historico } from "@/lib/teo";
import { tabelaDePrecos } from "@/lib/calls-feedback";

// Feedback detalhado de cada call pro vendedor, no privado (Fernando, 19/11).
// É a análise que o Fernando aprovou no chat: o que o vendedor fez bem, o que
// errou (com a fala e o certo), preço e condições x tabela, o que ele mandou
// no WhatsApp depois da call e o próximo passo. Fica em call_feedbacks
// (migração 0128); o OpenClaw do Fernando busca em /api/openclaw/feedbacks e
// manda no WhatsApp do vendedor. A nota pós-call na conversa do lead
// (calls-feedback.ts) continua igual.

const MODEL = process.env.CALLS_FEEDBACK_MODEL || "claude-opus-5-5";
// Só transcrições das últimas 24h (não reprocessa o acervo nem manda ao
// vendedor feedback de call antiga).
const JANELA_MS = 24 * 3600_000;
// Abaixo disso é sala vazia ou só "e aí" (a presença cuida).
const MIN_CARACTERES = 1500;
const MAX_TENTATIVAS = 3;
// Feedback "gerando" há mais que isso é de uma rodada que morreu: pode refazer.
const TRAVADO_MS = 15 * 60_000;
// Erro: espera antes de tentar de novo.
const REPETIR_ERRO_MS = 20 * 60_000;

const SISTEMA = `Você é o coach de vendas do Canal do Anfitrião (cursos de Airbnb do Rômulo Villela). Lê a transcrição de uma call de vendas entre um especialista (vendedor) e um lead e escreve o feedback da call DIRETO PRO VENDEDOR, que ele recebe no WhatsApp privado logo depois que a transcrição fica pronta. Fale com ele de "você", de colega pra colega: direto, específico, sem bronca e sem elogio vazio.

Formato (WhatsApp: *negrito* com um asterisco, sem markdown de título, sem "#", listas com •):
*Feedback da call de DIA às HORA com LEAD* · duração aproximada, como terminou (ex.: sem venda, vendeu, ficou de pensar)

✅ *O que você fez bem*
• 2 ou 3 coisas, cada uma com a fala real dele entre aspas.

❌ *O que ajustar*
• Cada erro com a fala real dele entre aspas e o certo (ou o que dizer no lugar). Do mais importante pro menos. Trailer não mostrado e call sem os slides entram aqui sempre.

🧭 *Roteiro e slides*
✓ Fez: as etapas e slides do roteiro que ele fez, em poucas palavras, separados por vírgula.
✗ Pulou: as que ele pulou, na ordem do roteiro (ex.: "rotular o problema, combinado dos dois sentimentos, trailer (slide 2), mesinha de 3 pernas, Calculadora (slide 10), resumo antes do preço, garantia junto do preço, link na call"). Seja literal: é cobrança de aderência ao roteiro, não sugestão.

💰 *Preço e condições* (só se houve preço/condição dita errada, preço que faltou dizer ou desconto fora da escada; senão, omita a seção)

⚠️ *Depois da call* (o que saiu no WhatsApp do lead desde a call, pelas mensagens abaixo; se ele prometeu mandar algo e não mandou, diga)

👉 *Próximo passo*
• O que mandar, quando (dia e hora) e com qual preço/condição da tabela.

A aderência ao roteiro e aos slides (bloco "Roteiro da call e slides" abaixo) é cobrada em toda call (Fernando, 19/11: "eu quero que você cobre a aderência ao roteiro. Se no roteiro tem um trailer pra passar, tem que cobrar"). O que mais pesa: trailer com som, os slides na tela, a mesinha de 3 pernas, o combinado dos dois sentimentos, a Calculadora com os números do lead, o resumo com as palavras dele antes do preço e a garantia junto do preço.

O que olhar na call: abriu pelo caso do lead? aprofundou a dor ("me conta mais", "o que você já tentou")? resumiu o caso nas palavras do lead antes de apresentar? ligou o produto à dor que o lead disse (e não à que ele imaginou)? ofereceu um produto atrás do outro a cada "não" sem perguntar o porquê? citou a garantia junto com o preço? contou caso de aluno? disse o preço? mandou o link na call? marcou retorno com dia e hora? convidou quem decide junto (cônjuge, sócio)? errou o nome do lead? prometeu resultado ou faturamento?

Regras:
- Preços, parcelas, garantias e condições: só os da tabela abaixo. Nunca sugira desconto fora da escada de cupons.
- Não cite faturamento, patrimônio nem estrutura societária do Rômulo/empresa. Se o vendedor citou, aponte o erro SEM repetir o número nem a fala ("citou o faturamento do Rômulo: não cite").
- Use só o primeiro nome do lead. Nada de telefone ou e-mail.
- A transcrição tem ruído (palavras soltas em inglês, nomes trocados pelo reconhecimento de voz): não aponte como erro do vendedor algo que pode ser erro da transcrição.
- Até 2.800 caracteres.
- Se a call não aconteceu de verdade (sala vazia, lead não apareceu, só cumprimento), responda exatamente [SEM_CALL].`;

// O roteiro novo (src/lib/roteiros/nova.html) e o deck que o vendedor
// compartilha na tela (deck-a5e: /deck do painel, conteúdo no storage
// pub/deck-a5e/deck.txt). Se o roteiro ou o deck mudarem, atualize aqui.
const ROTEIRO_E_SLIDES = `# Roteiro da call e slides (o que o vendedor tem que fazer, nesta ordem)
Etapa 1 · Abertura pela ficha do Téo. Sem "você conhece o Rômulo?".
Etapa 2 · Rotular: "Deixa eu ver se entendi: hoje você [onde está], quer chegar em [meta], e o que está no caminho é [problema]. É isso?" Se ela corrigir, rotula de novo.
Etapa 3 · Ciclo da dor: o que já tentou, como foi, o que gostou e o que não gostou; alguém decide junto?; quer aprender ou que façam por você?; munição pro preço (diária média e noites ocupadas por mês); achar a perna bamba (mensagem chega e não fecha, ou nem chega? preço na mão, no automático ou fixo?).
Etapa 4 · Transição: "Posso te mostrar?" e o combinado dos dois sentimentos ("faz sentido pro meu momento" ou "não era isso que eu precisava"), esperando o "combinado".
Etapa 5 · Vender a viagem com os slides na tela (deck de 19 slides): slide 1 capa (comunidade, 12 meses: calendário cheio, 5 estrelas, o Pix caindo); slide 2 TRAILER do Anfitrião 5 Estrelas COM SOM (3min46, obrigatório, antes dos pilares); slide 3 o Rômulo numa frase (quartinho no Airbnb em 2016, hoje mais de 60 imóveis); slide 4 a mesinha de 3 pernas (anúncio que converte, virar queridinho do algoritmo, experiência 5 estrelas; ciclo virtuoso), com "faz sentido?" depois de cada perna e mais tempo na perna bamba; slide 5 comunidade (grupo no WhatsApp com o Rômulo dentro + lives mensais); slides 6 a 9 o Max, concierge de IA 24h; slide 10 Calculadora de Ganhos com a diária e as noites do lead (+10% na diária e +3 noites por mês); slides 11 a 14 o que vem junto, aulas, calls ao vivo e masterclasses (rápido, sem tour de módulos). Chamar de comunidade, não de curso.
Etapa 6 · Fechamento: slide 15 "Resumindo: lembra do que você me disse? Hoje / meta / no caminho. Faz sentido pra você?" e "qual dos dois sentimentos ficou?"; slide 16 investimento (Anfitrião 5 Estrelas R$ 2.997 ou 12x R$ 299,70) com a garantia de 14 dias ("a lei dá 7, a gente dá 14"); slide 17 casos de quem já fez; slide 18 primeiros passos depois do sim; slide 19 "Bora começar hoje?" e o link na própria call.
Etapa 7 · Objeções: caso de aluno do Cofre de Cases, o mais parecido com o lead; escada de preço com prazo (R$ 2.997 sempre primeiro; R$ 2.797 só com objeção de preço; R$ 2.497 só com trava concreta; depois só o bônus de Booking). Saída sem sim: retorno com dia e hora, chamando quem decide junto.
Em call de Black ou de upgrade de aluno, o caminho é o mesmo com o produto trocado (preços e garantia pela tabela).

Como ver pela transcrição: o trailer tocou com som quando aparecem falas do Rômulo como "Onde é que está o seu imóvel, no campo, na cidade ou no litoral?", "Rômulo, não complica" ou "de norte a sul desse brasilzão" (às vezes atribuídas ao vendedor, porque o som sai pelo computador dele). Se nenhuma aparece, o trailer NÃO foi mostrado (sem som conta como não mostrado). Slides: "posso compartilhar minha tela?", "tá vendo?", "aqui na tela" e o vendedor lendo o texto dos slides. Sem tela compartilhada = não usou os slides.`;

type Transcricao = {
  join_url: string;
  teo_call_id: string;
  transcricao: string | null;
  inicio: string | null;
  transcrito_em: string | null;
};

type Feedback = { teo_call_id: string; status: string; tentativas: number; atualizado_em: string };

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

const horaSP = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

// O que saiu na conversa do lead desde o começo da call (o vendedor manda o
// follow-up por lá). Texto curto por mensagem; nota interna marcada como tal.
async function depoisDaCall(supabase: SupabaseClient, contactId: string, inicio: string): Promise<string> {
  try {
    const desde = new Date(inicio).getTime();
    const msgs = (await historico(supabase, contactId)).filter((m) => new Date(m.date).getTime() >= desde);
    if (!msgs.length) return "(nenhuma mensagem na conversa do lead desde a call)";
    return msgs
      .slice(-30)
      .map((m) => {
        const quem =
          m.senderBy === "contact"
            ? "Lead"
            : m.type === "note"
              ? "Nota interna"
              : m.senderBy === "platform"
                ? "Sistema"
                : `Time${m.origin ? ` (${m.origin})` : ""}`;
        const texto = m.type === "template" ? "(mensagem automática por template)" : (m.message ?? `(${m.type})`);
        return `[${horaSP(m.date)}] ${quem}: ${texto.replace(/\s+/g, " ").slice(0, 400)}`;
      })
      .join("\n");
  } catch (e) {
    return `(não deu pra ler a conversa: ${e instanceof Error ? e.message.slice(0, 120) : String(e)})`;
  }
}

// Reserva a call pra esta rodada (duas rodadas do cron podem se sobrepor):
// cria a linha "gerando", ou retoma uma que deu erro ou travou.
async function reservar(supabase: SupabaseClient, l: Transcricao, atual: Feedback | undefined): Promise<boolean> {
  const agora = new Date().toISOString();
  if (!atual) {
    const { error } = await supabase
      .from("call_feedbacks")
      .insert({ teo_call_id: l.teo_call_id, join_url: l.join_url, status: "gerando", tentativas: 1, atualizado_em: agora });
    return !error;
  }
  const { data } = await supabase
    .from("call_feedbacks")
    .update({ status: "gerando", tentativas: atual.tentativas + 1, atualizado_em: agora })
    .eq("teo_call_id", l.teo_call_id)
    .eq("status", atual.status)
    .eq("tentativas", atual.tentativas)
    .select("teo_call_id");
  return Boolean(data?.length);
}

function precisa(f: Feedback | undefined): boolean {
  if (!f) return true;
  if (f.tentativas >= MAX_TENTATIVAS) return false;
  const idade = Date.now() - new Date(f.atualizado_em).getTime();
  if (f.status === "erro") return idade > REPETIR_ERRO_MS;
  if (f.status === "gerando") return idade > TRAVADO_MS;
  return false;
}

export async function feedbacksDoVendedor(
  supabase: SupabaseClient,
  inicioRodada: number,
  limiteMs: number,
  log: (note: string, body: Record<string, unknown>) => Promise<void>
): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  const { data } = await supabase
    .from("call_transcricoes")
    .select("join_url, teo_call_id, transcricao, inicio, transcrito_em")
    .eq("status", "ok")
    .not("teo_call_id", "is", null)
    .gte("transcrito_em", new Date(Date.now() - JANELA_MS).toISOString())
    .order("transcrito_em")
    .limit(30);
  const linhas = ((data ?? []) as Transcricao[]).filter((l) => (l.transcricao ?? "").length >= MIN_CARACTERES);
  if (!linhas.length) return [];
  const { data: existentes } = await supabase
    .from("call_feedbacks")
    .select("teo_call_id, status, tentativas, atualizado_em")
    .in(
      "teo_call_id",
      linhas.map((l) => l.teo_call_id)
    );
  const porCall = new Map(((existentes ?? []) as Feedback[]).map((f) => [f.teo_call_id, f]));
  const fila = linhas.filter((l) => precisa(porCall.get(l.teo_call_id)));
  if (!fila.length) return [];

  const tabela = await tabelaDePrecos(supabase);
  const client = new Anthropic();
  const feitos: string[] = [];
  for (const l of fila) {
    if (Date.now() - inicioRodada > limiteMs) break;
    if (!(await reservar(supabase, l, porCall.get(l.teo_call_id)))) continue;
    const salvar = (campos: Record<string, unknown>) =>
      supabase
        .from("call_feedbacks")
        .update({ ...campos, atualizado_em: new Date().toISOString() })
        .eq("teo_call_id", l.teo_call_id);
    try {
      const { data: k } = await supabase
        .from("teo_calls")
        .select("contact_id, nome, vendedor, resumo, inicio")
        .eq("id", l.teo_call_id)
        .maybeSingle();
      const inicio = ((k?.inicio as string | null) ?? l.inicio) || new Date().toISOString();
      const vendedor = ((k?.vendedor as string | null) ?? "").trim();
      const lead = ((k?.nome as string | null) ?? "").trim().split(/\s+/)[0] || "lead";
      const { dia, hora } = quando(inicio);
      const depois = k?.contact_id ? await depoisDaCall(supabase, k.contact_id as string, inicio) : "(sem conversa)";
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 10000,
        thinking: { type: "adaptive" },
        system: [
          { type: "text", text: SISTEMA },
          { type: "text", text: `${ROTEIRO_E_SLIDES}\n\n${tabela}`, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content:
              `Call de ${dia} às ${hora}. Vendedor: ${vendedor.split(/\s+/)[0] || "especialista"}. Lead: ${lead}.\n\n` +
              `Ficha que o Téo (pré-vendedor no WhatsApp) passou antes da call:\n${(k?.resumo as string | null) ?? "(sem ficha)"}\n\n` +
              `Conversa do lead no WhatsApp desde o começo da call (até agora, ${horaSP(new Date().toISOString())}):\n${depois}\n\n` +
              `Transcrição (pode ter ruído e palavras soltas em inglês):\n${(l.transcricao ?? "").slice(0, 120_000)}`,
          },
        ],
      });
      const texto = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const base = { vendedor: vendedor || null, lead, call_inicio: inicio, join_url: l.join_url };
      if (!texto || texto.includes("[SEM_CALL]")) {
        await salvar({ ...base, status: "sem_call", texto: null, erro: null, gerado_em: new Date().toISOString() });
        await log("feedback do vendedor: call não aconteceu", { teo_call_id: l.teo_call_id, nome: k?.nome });
        continue;
      }
      await salvar({ ...base, status: "pronto", texto: texto.slice(0, 4000), erro: null, gerado_em: new Date().toISOString() });
      await log("feedback do vendedor pronto", {
        teo_call_id: l.teo_call_id,
        nome: k?.nome,
        vendedor,
        entrada: resp.usage.input_tokens,
        saida: resp.usage.output_tokens,
      });
      feitos.push(`${lead} (${vendedor.split(/\s+/)[0]})`);
    } catch (e) {
      const erro = e instanceof Error ? e.message.slice(0, 300) : String(e);
      await salvar({ status: "erro", erro });
      await log("ERRO: feedback do vendedor", { teo_call_id: l.teo_call_id, erro });
    }
  }
  return feitos;
}
