import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { graphToken } from "@/lib/graph";
import {
  anotar,
  enviarTexto,
  historico,
  ouvirAudios,
  rodarTeo,
  unnichat,
  type LeadTeo,
  type MsgUnnichat,
} from "@/lib/teo";

// Téo, versão 1: roda a cada minuto (cron da Vercel). Para cada conversa
// inscrita em teo_conversas:
//  - "novo": se a janela de 24h está aberta, abre a conversa; se fechou,
//    manda o template de abertura uma vez e espera a resposta;
//  - "em_conversa": se a última mensagem é do lead (e ainda não foi tratada),
//    espera ~25s (o lead costuma mandar várias seguidas) e responde;
//  - "humano"/"encerrado": não faz nada.
// Botão de desligar: teo_config.ligado = false.

export const maxDuration = 300;

const ORCAMENTO_MS = 240_000;
const PARALELO = 3;
const ESPERA_MS = 25_000; // junta mensagens seguidas do lead antes de responder
const JANELA_MS = 23.5 * 3600_000;

interface Conversa {
  contact_id: string;
  nome: string | null;
  telefone: string | null;
  estado: string;
  ultima_msg_tratada: string | null;
  respostas: number;
  ficha: string | null;
  template_em: string | null;
  criado_em: string;
  formulario: Record<string, string> | null;
  formulario_em: string | null;
  motivo_humano: string | null;
  followup_etapa: number;
  silencio_desde: string | null;
  followup_em: string | null;
  black_passou_em?: string | null;
  black_vendedor?: string | null;
  black_retomou_em?: string | null;
  /** Teste de venda direta: true = o Téo vende este lead até o fim, sem call. */
  venda_teo?: boolean | null;
  /** Cupom pedido "à equipe": o Téo volta com a condição em cupom_em. */
  cupom_pendente?: CupomPedido | null;
  cupom_em?: string | null;
}

/** Degrau da escada de cupons (teo_config.cupons). */
interface Cupom {
  codigo: string;
  produto: string;
  degrau: number;
  para: string;
  quando: string;
  condicao: string;
  link: string | null;
  /** Bônus (sem baixar o preço): o time libera depois da compra. */
  bonus?: boolean;
  /** Pra quem vale: aluno confirmado (inclui imersão e Encontro), aluno de curso
   * (comprou curso ou tem tag de aluno), não aluno ou todos (padrão). */
  publico?: "aluno" | "aluno_curso" | "nao_aluno" | "todos";
}
interface CupomPedido {
  codigo: string;
  produto: string;
  degrau: number;
  condicao: string;
  link: string | null;
  bonus?: boolean;
  motivo: string;
  pedido_em: string;
  /** A "equipe" respondeu: daqui em diante a condição está aprovada pra ela. */
  respondida_em?: string | null;
}

const CAMPOS_CONVERSA =
  "contact_id, nome, telefone, estado, ultima_msg_tratada, respostas, ficha, template_em, criado_em, formulario, formulario_em, motivo_humano, followup_etapa, silencio_desde, followup_em, black_passou_em, black_vendedor, black_retomou_em, venda_teo, cupom_pendente, cupom_em";

interface Config {
  ligado: boolean;
  horarios: string[] | null;
  vendedores: { nome: string; email: string; atendente_id: string; sala?: string | null }[] | null;
  auto_inscrever_ate: string | null;
  /** Modo Black: até quando vale (null = desligado). */
  black_ate?: string | null;
  /** Teste de venda direta do Téo: a cada N leads que vão pra call, o próximo
   * lead novo o Téo vende sozinho (null = desligado). Conta desde venda_teo_desde. */
  venda_teo_a_cada?: number | null;
  venda_teo_desde?: string | null;
  /** Venda direta do dia: até quando todo lead sem especialista é do Téo, sem call (null = desligado). */
  venda_direta_ate?: string | null;
  /** Escada de cupons na venda por mensagem (com o "vou confirmar com a equipe"). */
  cupons?: Cupom[] | null;
  contexto: string;
  precos: string | null;
  instrucoes_extras: string | null;
  max_respostas: number;
  atendente_id: string | null;
  template_abertura_id: string | null;
  template_lembrete_id?: string | null;
  tag_teo_id: string | null;
  followup_horas: number[] | null;
  followup_templates: string[] | null;
  teams_tenant_id: string | null;
  teams_client_id: string | null;
  teams_organizador: string | null;
  /** id (objeto do Entra) do organizador; a API de reuniões online pede o id */
  teams_organizador_id?: string | null;
}

const CAMPOS_PESQUISA: Record<string, string> = {
  "numero-imoveis": "imóveis",
  faturamento: "faturamento",
  "tipo-imovel": "tipo de imóvel",
  dificuldade: "maior dificuldade",
};

function limpa(v: unknown): string {
  const s = Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "";
  return s
    .replace(/^\[|\]$/g, "")
    .replace(/"/g, "")
    .replace(/(^|,\s*)\d+_/g, "$1")
    .trim();
}

// Campos do formulário de inscrição do site (merge fields do Mailchimp) que o
// Téo usa pra não perguntar de novo.
const CAMPOS_FORMULARIO: Record<string, string> = {
  NIMOVEIS: "imóveis",
  MMERGE16: "faturamento mensal",
};

async function buscarFormulario(email: string): Promise<Record<string, string> | null> {
  const key = process.env.MAILCHIMP_API_KEY;
  const lista = process.env.MAILCHIMP_LIST_ID;
  const dc = key?.split("-")[1];
  if (!key || !lista || !dc) return null;
  const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  const res = await fetch(
    `https://${dc}.api.mailchimp.com/3.0/lists/${lista}/members/${hash}?fields=merge_fields`,
    { headers: { Authorization: `Basic ${Buffer.from(`x:${key}`).toString("base64")}` } }
  );
  if (res.status === 404) return {};
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as { merge_fields?: Record<string, unknown> } | null;
  const out: Record<string, string> = {};
  for (const [tag, rot] of Object.entries(CAMPOS_FORMULARIO)) {
    const v = String(j?.merge_fields?.[tag] ?? "").trim();
    if (v) out[rot] = v;
  }
  return out;
}

// Respostas do formulário, guardadas na conversa. Busca uma vez; se veio vazio
// logo que o lead entrou (o Mailchimp pode atrasar), tenta de novo depois de
// 10 min, até 2h depois da inscrição.
async function formularioDaConversa(
  supabase: SupabaseClient,
  c: Conversa,
  email: string | null
): Promise<Record<string, string>> {
  const atual = c.formulario;
  const vazio = !atual || Object.keys(atual).length === 0;
  const tentarDeNovo =
    vazio &&
    (!c.formulario_em ||
      (Date.now() - new Date(c.formulario_em).getTime() > 10 * 60_000 &&
        Date.now() - new Date(c.criado_em).getTime() < 2 * 3600_000));
  if (!email || !tentarDeNovo) return atual ?? {};
  const novo = await buscarFormulario(email).catch(() => null);
  if (novo === null) return atual ?? {};
  await supabase
    .from("teo_conversas")
    .update({ formulario: novo, formulario_em: new Date().toISOString() })
    .eq("contact_id", c.contact_id);
  return novo;
}

async function carregarLead(supabase: SupabaseClient, c: Conversa): Promise<LeadTeo> {
  const { data } = await supabase
    .from("leads")
    .select("name, created_at, extra, email")
    .eq("unnichat_id", c.contact_id)
    .maybeSingle();
  const extra = (data?.extra ?? {}) as Record<string, unknown>;
  const respostas: Record<string, string> = {};
  for (const [k, rot] of Object.entries(CAMPOS_PESQUISA)) {
    const v = limpa(extra[k]);
    if (v) respostas[rot] = v;
  }
  const tags = Array.isArray(extra.tags) ? (extra.tags as unknown[]).map(String) : [];
  const formulario = await formularioDaConversa(supabase, c, data?.email ?? null);
  return {
    nome: data?.name ?? null,
    criadoEm: data?.created_at ?? null,
    respostas,
    tags,
    formulario,
    email: data?.email ?? null,
  };
}

async function log(supabase: SupabaseClient, note: string, body: Record<string, unknown>) {
  await supabase.from("webhook_log").insert({ source: "teo", note, body });
}

// ---------- modo Black ----------

function blackAtiva(cfg: Config): boolean {
  return Boolean(cfg.black_ate && new Date(cfg.black_ate).getTime() > Date.now());
}

// Vendedores de plantão na Black: das 9h às 23h de Brasília.
function plantaoBlack(): boolean {
  const h = new Date(Date.now() - 3 * 3600_000).getUTCHours();
  return h >= 9 && h < 23;
}

const ALUNO_TAG = /^(aluno|alunoa5e|aluno-a5e|aluno-gigantes|aluno-geral|alunos-a5e|gigantes-\d|comprou:)/i;
const ESPERA_BLACK_MS = 10 * 60_000;

// Compra de curso que dá condição de aluno na Black: os cursos do combo e a
// Black passada. Ingresso de Encontro e imersão não contam.
const CURSO_RE = /(anfitri[aã]o 5 estrelas|gigantes da temporada|subloca|booking|black friday hist|decora[cç][aã]o|fotografia)/i;
const NAO_CURSO_RE = /(encontro|imers[aã]o|ingresso)/i;
// Quem é aluno pra condição da Black (live de 05/11, Rômulo e Fernando, com o
// slide): quem já comprou material educacional: imersão (ao vivo ou gravação),
// Anfitrião 5 Estrelas (inclusive a renovação), Sublocação, Gigantes, ingresso
// de qualquer Encontro, Booking, a Black passada, Decoração, Fotografia.
// Adesivo não conta. Até 14/11 imersão e Encontro ficavam de fora (erro: a
// Evelyn, do 4º Encontro VIP, ouviu o preço de não aluno). O Max continua só
// pra curso (CURSO_RE sem NAO_CURSO_RE).
const ALUNO_COMPRA_RE = /(anfitri[aã]o 5 estrelas|gigantes|subloca|booking|black friday hist|decora[cç][aã]o|fotografia|imers[aã]o|encontro)/i;
const ehCurso = (produto: string) => CURSO_RE.test(produto) && !NAO_CURSO_RE.test(produto);
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

// E-mail do cadastro e os que o lead mandou na conversa (no máximo 5).
function emailsDaConversa(cadastro: string | null, msgs: MsgUnnichat[]): string[] {
  const achados = new Set<string>();
  if (cadastro?.includes("@")) achados.add(cadastro.trim().toLowerCase());
  for (const m of msgs) {
    if (m.senderBy !== "contact" || !m.message) continue;
    for (const e of m.message.match(EMAIL_RE) ?? []) achados.add(e.toLowerCase().replace(/\.$/, ""));
  }
  return [...achados].slice(-5);
}

// Quem tem o Max (assistente de IA): comprou a Black, o Anfitrião 5 Estrelas ou o Gigantes.
const MAX_RE = /(anfitri[aã]o 5 estrelas|gigantes da temporada|black friday hist)/i;
const MAX_TAG = /^(alunoa5e|aluno-a5e|alunos-a5e|aluno-gigantes|gigantes-\d)/i;
const AVISO_MAX =
  "ASSISTENTE DE IA (este lead já comprou a Black, o Anfitrião 5 Estrelas ou o Gigantes; vale acima da regra de suporte dos ajustes do dono): se ele perguntar do assistente de IA, responda direto, sem passar pro suporte: é o Max, o concierge. Ele fica no grupo de WhatsApp dos alunos e dá pra chamar ele no privado pelo +55 11 91164-7699. Login, senha, cobrança e outros problemas de acesso continuam com o suporte.";

async function acharCompraDeCurso(
  supabase: SupabaseClient,
  emails: string[],
  re: RegExp = ALUNO_COMPRA_RE,
  excluir: RegExp | null = null
): Promise<{ email: string; produto: string } | null> {
  const { data } = await supabase
    .from("sales")
    .select("buyer_email, product")
    .eq("status", "paga")
    .or(emails.map((e) => `buyer_email.ilike.${e}`).join(","))
    .limit(200);
  const achadas = (data ?? []).filter((s) => re.test(s.product ?? "") && !(excluir && excluir.test(s.product ?? "")));
  // Curso primeiro: imersão ou Encontro só se não houver curso.
  const curso = achadas.find((s) => ehCurso(s.product ?? "")) ?? achadas[0];
  return curso ? { email: String(curso.buyer_email).toLowerCase(), produto: String(curso.product) } : null;
}

// Checkout da Black (os mesmos botões das páginas de pagamento), com
// utm_source=teo: a venda que o Téo fecha sozinho aparece como dele na Eduzz.
// Só pra lead sem especialista (o lead de um vendedor continua com a página,
// sem mexer na atribuição dele).
const CHECKOUT_TEO = {
  naoAluno: {
    pix: "https://chk.eduzz.com/Q9N54JR101?p=1&utm_source=teo",
    cartao: "https://chk.eduzz.com/Q9N54JR101?utm_source=teo",
    boleto: "https://pay.tmb.com.br/CANALDOANFIT/P3D32578592?utm_source=teo",
  },
  aluno: {
    pix: "https://sun.eduzz.com/Q9N54JR101?cupom=BLACKFRIDAYALUNOS&p=1&utm_source=teo",
    cartao: "https://sun.eduzz.com/Q9N54JR101?cupom=BLACKFRIDAYALUNOS&utm_source=teo",
    boleto: "https://pay.tmb.com.br/CANALDOANFIT/7UV325776UG?utm_source=teo",
  },
};

// Upgrade pra Black de quem já é (ou foi) aluno: a oferta da página oficial
// (anfitriao5estrelas.com.br/black-friday-historica/, lida em 14/11), a live de
// 05/11 (Rômulo e Fernando, transcrição enviada pelo Fernando em 14/11) e o
// argumento do Fernando: pra aluno, a Black sai pelo preço do Gigantes sozinho.
function blocoUpgradeAluno(vendendoPorAqui: boolean): string {
  return [
    "# UPGRADE PRA BLACK (este lead é aluno ou ex-aluno confirmado)",
    "Aluno, pra Black, é quem já comprou material educacional do Canal: curso, imersão (ao vivo ou gravada) ou ingresso de algum Encontro. Adesivo não conta. Pra quem já tem o Anfitrião 5 Estrelas, a venda é o upgrade, nunca o Anfitrião 5 Estrelas de novo. Pra quem só fez imersão ou foi a um Encontro, a Black é o jeito de ter o Anfitrião 5 Estrelas e todo o resto pelo preço de aluno. Este bloco substitui as etapas 5 (vender a viagem) e 6 (fechamento) do \"Roteiro de venda por mensagem\"; as etapas 1 a 4 e as objeções continuam valendo.",
    vendendoPorAqui
      ? "Você está vendendo por aqui: conduza até o link, sem call."
      : "Seu objetivo continua sendo a call: use só o argumento central, curto, pra mostrar por que vale o papo de 20 min com o especialista. Não faça o roteiro inteiro por mensagem.",
    "O argumento central: pra aluno, a Black sai pelo preço do Gigantes sozinho.",
    "- Gigantes avulso: R$ 4.997 por 1 ano de acesso e de comunidade (depois renova a R$ 1.997 por ano).",
    "- Black pra aluno e ex-aluno: os mesmos R$ 4.997 à vista ou 12x de R$ 499,70 (boleto parcelado com análise: 12x de R$ 549,70), e ela leva: os 6 cursos com acesso vitalício (Anfitrião 5 Estrelas, Gigantes, Sublocação, Booking, Decoração Estratégica e Fotografia Prática; nunca mais paga renovação deles), 4 anos das duas comunidades de WhatsApp (a do Anfitrião 5 Estrelas, com uns 935 anfitriões, e a do Gigantes, com uns 324 gestores, as duas com o Rômulo dentro todo dia e encontros mensais), as gravações das 4 edições do Encontro de Anfitriões, o assistente de IA por 1 ano e o ingresso do Encontro presencial de 2027, de 2 dias em São Paulo (só pros 100 primeiros compradores). Os 4 anos contam da data da compra.",
    "- \"É Black de verdade: a gente não dobra o preço pra dar desconto\" (palavras do Rômulo). E é uma vez por ano: quem não aproveitar agora só tem a condição de aluno de novo na próxima Black; um curso avulso depois sai pelo preço cheio.",
    "- Decoração Estratégica e Fotografia Prática são os cursos novos do Canal e entram na Black (saem primeiro pra quem é da Black, e só depois pro mercado). Fora esses dois, curso lançado depois não entra automaticamente (está na página). Nunca prometa outro curso futuro.",
    "Quem é o público do Gigantes (o caminho mais forte do upgrade): quem já tem 2 imóveis ou mais, faz ou quer fazer gestão pra terceiros, é corretor ou tem imobiliária, ou quer crescer pra dezenas de imóveis e virar empresa. A história do Rômulo é essa: começou alugando um quartinho no Airbnb, depois os imóveis da família, em 2018 começou a sublocar, e de repente se viu administrando 10, 15, 20 imóveis: \"agora eu tenho uma empresa\". Hoje são mais de 60.",
    "A dor que o Gigantes resolve: com 10, 15, 20 imóveis vem uma avalanche de check-ins, mensagens e limpezas que o Anfitrião 5 Estrelas não dá mais conta. O que tem no Gigantes (20 módulos, 167 aulas): estruturar o negócio pra gerir vários imóveis; captar e gerir imóveis de terceiros (como apresentar o serviço ao proprietário); modelo de contrato de administração (\"no começo vai de boca: cobro 20%, pode deixar que eu cuido. Cuida do quê?\"); quanto cobrar de comissão, em nome de quem fica o anúncio, em que conta cai o dinheiro e como prestar contas ao proprietário; nota fiscal, CNAE e impostos; quais tecnologias usar (channel manager, PriceLabs); montar equipe de atendimento, limpeza e manutenção. E um bônus de quem está no grupo: o Rômulo recebe pedido de proprietário do Brasil todo querendo gestão e indica pra comunidade do Gigantes.",
    "Casos da live (use no máximo um, ligado ao caso dela; é história, não promessa de resultado): um gestor da região de Piracicaba tinha 16 imóveis quando conheceu o Rômulo e hoje tem 45, quase todos de terceiros, e diz que o curso ajudou na captação de proprietários; o Arnaldo, de Santos, largou a profissão pra focar 100% na empresa de gestão e está com 11 apartamentos, rumo a 20 (é do Gigantes); uma operação de alunos começou com 2 imóveis no fim de 2021 (R$ 15 mil naqueles 2 meses), chegou a 22 imóveis e R$ 420 mil em 2024 e faturou R$ 800 mil em 2025; um gestor fez o Gigantes e renovou só pra continuar no grupo; o Diogo, de Serra Negra, chegou a 10 imóveis em 5 meses.",
    "Nas etapas 1 a 3, com aluno, descubra: quantos imóveis tem hoje, se são dela ou de proprietários, se quer crescer (quantos, até quando), o que mais toma o tempo dela e se o acesso ao Anfitrião 5 Estrelas ainda está ativo, já venceu ou se ela nunca teve (só imersão ou Encontro).",
    "Etapa 5 pra aluno (vender o próximo nível, uma ideia por mensagem, com \"faz sentido?\"):",
    "- Se ela é do público do Gigantes: o Gigantes no centro, ligado à dor que ela contou (o que trava o crescimento), um caso parecido com o dela, e depois: \"e na Black ele vem junto com tudo, vitalício\".",
    "- Se ela tem 1 imóvel e não quer crescer agora: no centro o vitalício (nunca mais renovar) e 1 ou 2 cursos que resolvem a perna bamba dela: Booking (depender menos do Airbnb), Decoração e Fotografia (anúncio que chama atenção e diária maior), Sublocação (crescer sem comprar imóvel). O Gigantes fica como \"quando você for pro segundo imóvel, já está lá\". Nunca despeje a lista inteira do combo: só o que serve ao caso.",
    "- Se ela nunca teve o Anfitrião 5 Estrelas (só imersão ou Encontro): o Anfitrião 5 Estrelas é a base (o \"saber cortar o cabelo antes de abrir o salão\", como diz o Rômulo) e vem na Black junto com o resto, pelo preço de aluno.",
    "- Pra quem é aluna há tempo: a comunidade de 4 anos (não 1) e o Encontro.",
    "Etapa 6 pra aluno (fechamento), sempre ancorando do maior pro menor, depois do resumo, da volta à dor e do \"faz sentido?\": \"Tudo isso somado vale R$ 25.152. Quem não é aluno paga R$ 8.997. Como você é aluna, sai R$ 4.997 à vista ou 12x de R$ 499,70: R$ 4.000 a menos, o mesmo preço do Gigantes sozinho. Só que o Gigantes sozinho é 1 ano; na Black ele é vitalício, junto com os outros 5 cursos e 4 anos das duas comunidades.\" Depois a garantia de 7 dias e \"bora fazer o upgrade hoje?\".",
    "Objeções de aluno:",
    "- \"Ainda não terminei o Anfitrião 5 Estrelas\": com a Black é vitalício, ela segue no ritmo dela e nada mais vence.",
    "- \"Vou só renovar\": a renovação do Anfitrião 5 Estrelas é R$ 997 por ano (4 anos = R$ 3.988, só ele); a Black é R$ 4.997 uma vez, com os 6 cursos vitalícios e 4 anos das duas comunidades.",
    "- \"Acabei de renovar\": quem pagou a renovação anual (R$ 997) em outubro ou novembro tem esse valor devolvido pelo time depois da compra da Black (regra do Fernando na live). Diga isso, siga com o link e anote na ficha \"renovou em [mês]: devolver R$ 997 da renovação\".",
    "- \"Acabei de comprar o curso\" ou \"ainda estou pagando\": a condição dela é a de aluno, R$ 4.000 a menos. Se ela pedir pra abater as parcelas do curso, você não sabe: chame passar_para_humano (motivo \"black\") e diga que o especialista responde por aqui.",
    "- \"Tenho 1 imóvel, o Gigantes não é pra mim\": os outros cursos e o vitalício já pagam; o Gigantes fica pronto pra quando ela crescer.",
    "- Caro ou parcela: trate como na seção \"Objeções\"; na venda por aqui, os cupons de aluno da seção \"Cupons\".",
    "- Se o ingresso do Encontro é VIP ou Standard, ou a data do Encontro: você não sabe (a previsão é maio de 2027); o especialista confirma.",
  ].join("\n");
}

function blocoBlack(o: {
  plantao: boolean;
  aluno: boolean;
  retomou: boolean;
  /** lead sem especialista: quem fecha a venda por aqui é o Téo (links com utm teo) */
  semEspecialista: boolean;
  /** lead sorteado pro teste de venda direta: o Téo vende até o fim, sem call */
  vendaTeo: boolean;
  /** venda direta do dia (teo_config.venda_direta_ate), não sorteio */
  vendaDia?: boolean;
}): string {
  const k = o.aluno ? CHECKOUT_TEO.aluno : CHECKOUT_TEO.naoAluno;
  const linksTeo = `Links pra pagar (use estes, um por forma de pagamento, quando a pessoa escolher): Pix ${k.pix} · Cartão ${k.cartao} · Boleto parcelado ${k.boleto}. A página continua valendo pra ela ver tudo antes.`;
  return [
    "# MODO BLACK FRIDAY (vale agora e manda mais que as outras regras de objetivo)",
    'A Black Friday Histórica do Canal do Anfitrião está aberta. O Rômulo abriu ao vivo em 05/11 às 19h (youtube.com/live/8VTlZf2qIUQ). Muita gente chega com "Vim da live da Black Friday Histórica e tenho uma dúvida".',
    o.vendaTeo
      ? [
          o.vendaDia
            ? "VENDA DIRETA HOJE — ESTE LEAD É SEU ATÉ O FIM. Hoje o time testa você vendendo sozinho, sem call, pra todo lead que ainda não tem especialista (vale acima de qualquer regra destas instruções ou dos ajustes do dono que mande oferecer call ou passar pro time)."
            : "TESTE DE VENDA DIRETA — ESTE LEAD É SEU ATÉ O FIM. Ele foi sorteado pro teste em que você mesmo vende, sem call (vale acima de qualquer regra destas instruções ou dos ajustes do dono que mande oferecer call ou passar pro time).",
          o.vendaDia
            ? [
                "Seu objetivo é VENDER POR AQUI O QUE FOR MELHOR PRO CASO DA PESSOA, não necessariamente a Black. Conduza pelo \"Roteiro de venda por mensagem\" (clarificar, rotular, ciclo da dor, combinado, vender a viagem, fechamento, objeções), sem pular etapas, e recomende UM produto só, ligado ao que ela contou: Anfitrião 5 Estrelas pra quem tem de 1 a 5 imóveis ou está pra começar; Gigantes pra quem tem muitos imóveis ou faz gestão pra terceiros; a Black (o combo com tudo) pra quem quer o pacote completo; pra aluno ou ex-aluno confirmado, a Black, pelo \"Upgrade pra Black\" (nunca o Anfitrião 5 Estrelas de novo); o ingresso do Encontro pra quem só quer o evento; Airbnb do Zero só como downsell, se ela disser que não quer o Anfitrião 5 Estrelas. A Mentoria Alfaiate continua só com o time.",
                "Preços: só os da seção \"Preços\" e deste bloco; nunca invente preço, desconto ou cupom (cupom só os da seção \"Cupons\", do jeito que ela manda). Hoje a regra de \"caro\" da Black dos ajustes do dono não vale: se o combo for demais pra ela, ofereça o produto avulso que serve ao caso, no preço da tabela.",
                "Trate as objeções como na seção \"Objeções\" e, quando ela topar, mande o link da forma de pagamento que ela escolher e acompanhe até concluir. Links que você tem: os da Black (neste bloco) e os do ingresso do Encontro (nos ajustes do dono); se os ajustes do dono trouxerem link de outro produto, use. Pra produto sem link aqui, quando ela topar, chame passar_para_humano (motivo \"comprar\", com o produto e a forma de pagamento) e diga que o link chega por aqui em seguida.",
              ].join(" ")
            : "Seu objetivo é VENDER A BLACK POR AQUI: entenda o caso em poucas perguntas (o que tem hoje, o que trava, o que quer), mostre como a Black resolve isso com 2 ou 3 pontos ligados ao caso dela (não a lista inteira), trate as objeções com curiosidade (pergunte o porquê, concorde com o que for verdade, sem rebater nem pressionar) e, quando ela topar, mande o link de pagamento da forma que ela escolher e acompanhe até concluir.",
          "Não ofereça call. Se ela mesma pedir call, aí marque normalmente com os horários da lista.",
          "Só chame passar_para_humano (motivo \"black\", resumo de uma linha) se ela pedir pra falar com uma pessoa, ou se precisar de algo que só o time decide: condição fora da tabela, outra forma de pagamento, abater curso já comprado, curso avulso.",
        ].join(" ")
      : "Seu objetivo é MARCAR A CALL de 20 min com o especialista (no Teams), como no fluxo normal: é na call que ele apresenta a Black e passa a melhor condição pro caso da pessoa. Tire a dúvida com as informações abaixo e emende com a call, oferecendo horários da lista.",
    "QUEM JÁ ESTÁ FECHANDO NÃO VAI PRA CALL: se a pessoa já decidiu comprar (pede o link, pergunta como paga, diz que vai fechar, ou a única dúvida que sobrou é de pagamento e você sabe responder), marcar call só adia a venda. Não ofereça call: passe o link de pagamento certo e ajude a concluir aqui mesmo. Call só se ela pedir.",
    o.vendaTeo
      ? ""
      : "Se a pessoa não puder ou não quiser call e preferir resolver por mensagem, quem atende por mensagem é você: siga tirando as dúvidas por aqui com as informações abaixo, passe a página de pagamento certa quando ela quiser comprar e deixe a call só como opção, sem insistir. Não diga que um vendedor vai atender por mensagem.",
    o.vendaTeo
      ? ""
      : o.retomou
      ? [
          "O especialista não respondeu a tempo, então agora quem atende é você, no lugar dele, até o fim da venda. Responda a dúvida e siga a venda por aqui: condição certa pro caso dela, forma de pagamento e a página de pagamento quando ela quiser comprar. Não ofereça call e não diga que o especialista vai responder, confirmar ou mandar algo; call só se ela pedir.",
          "Se o especialista já tinha conversado com ela, continue de onde ele parou: não repita o que ele já disse e não contradiga o que ele combinou. Você continua sendo o Téo, da equipe do Rômulo: não se passe pelo especialista.",
          "Comece natural, sem dizer que o especialista sumiu (ex.: \"Pra você não ficar esperando, já te adianto:\"). Se a última mensagem dela for só um agradecimento ou um \"vou ver\", responda curto e deixe a porta aberta, sem insistir.",
          "Não chame passar_para_humano por causa da Black de novo; só pra suporte, mentorado, se a pessoa pedir uma pessoa, ou se ela precisar de algo que só o time decide (condição fora da tabela, abater curso já comprado).",
        ].join(" ")
      : [
          'Cumprimente, diga quem você é (Téo, da equipe do Rômulo) e, se a dúvida não estiver clara, pergunte em UMA frase o que a pessoa quer saber. Responda com as informações abaixo e ofereça dois horários da lista pra call com o especialista (a não ser que ela já esteja fechando: aí feche por aqui).',
          o.plantao
            ? 'Só chame passar_para_humano (motivo "black", com um resumo de uma linha: se é aluna e o que quer) se a pessoa pedir pra falar com uma pessoa, ou se, sem call, ela precisar de algo que só o time decide (condição fora da tabela, abater curso já comprado, outra forma de pagamento). Nesse caso diga que esse ponto o especialista responde por aqui; o resto você mesmo resolve.'
            : "Se a pessoa recusar a call e pedir uma pessoa, diga que um especialista fala com ela a partir das 9h e chame passar_para_humano (pediu_humano).",
        ].join(" "),
    "Tom: a maior parte do público já é aluno ou já comprou algo do Rômulo. A linha é \"você já conhece o resultado, agora leva tudo\". Nada de narrativa de dor.",
    "Nunca fale de sócios, sociedade, estrutura da empresa, faturamento, metas ou números de vendas.",
    "Mentorado da Mentoria Alfaiate: não venda nada; chame passar_para_humano (pediu_humano). Dúvida de acesso/plataforma de aluno: passar_para_humano (suporte).",
    "",
    "A oferta (Black Friday Vitalícia), um combo que leva tudo:",
    "- Anfitrião 5 Estrelas (R$ 2.997), Gigantes da Temporada (R$ 4.997), Sublocação (R$ 997), Booking (R$ 997), Decoração (R$ 697) e Fotografia (R$ 497).",
    "- Assistente pessoal de IA por 1 ano (R$ 997): a novidade de 2026. Não detalhe como é entregue.",
    "- Ingresso do Encontro presencial 2027 + gravações das 4 edições, só pros 100 primeiros (R$ 997).",
    "- Comunidades de WhatsApp por 4 anos (A5E R$ 3.988 e Gigantes R$ 7.988).",
    "- Tudo somado: R$ 25.152.",
    "Preço:",
    "- Quem não é aluno: R$ 8.997 à vista ou 12x de R$ 899,71 no cartão (também Pix e saldo Eduzz). Boleto parcelado (com análise): 12x de R$ 949,71. Página: anfitriao5estrelas.com.br/pagamento-nao-alunos/",
    o.aluno
      ? "- Este lead É aluno (pelo cadastro): pra ele é R$ 4.997 à vista ou 12x de R$ 499,70, com o cupom BLACKFRIDAYALUNOS. Página: anfitriao5estrelas.com.br/pagamento-alunos/"
      : // Os e-mails já conferidos são deste lead: vão em avisoEmailsSemCompra(),
        // fora deste bloco, pra ele continuar igual entre leads (cache).
        "- Aluno tem condição especial (quem já comprou qualquer curso, imersão ou ingresso de Encontro; adesivo não conta), mas o cadastro deste lead não mostra compra: nunca passe o cupom nem o preço de aluno. Se a pessoa disser que é aluna, que fez imersão ou que foi a um Encontro, peça o e-mail que ela usou na compra; o sistema confere e, se achar, na sua próxima resposta este bloco já vem com a condição de aluno. Não diga que o especialista confirma.",
    "- Página da Black: anfitriao5estrelas.com.br/black-friday-historica/",
    o.semEspecialista || o.vendaTeo ? `- ${linksTeo}` : "",
    "Garantia da Black: 7 dias.",
    o.aluno ? blocoUpgradeAluno(o.vendaTeo) : "",
    "Você não sabe: quando o carrinho fecha e o que o assistente de IA faz além do que está em \"Assistente de IA (o Max)\". Não invente nada disso: o especialista confirma.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Compra da Black 2026 já feita por este lead: pelos e-mails (cadastro e os que
 * ele mandou na conversa) ou pelo telefone do WhatsApp, na Eduzz e na TMB
 * (função teo_compra_black do banco). Sem isso o Téo oferecia a Black a quem já
 * tinha comprado (Ricardo, 11/11).
 */
async function acharCompraDaBlack(
  supabase: SupabaseClient,
  emails: string[],
  telefone: string | null
): Promise<{ origem: string; quando: string; email: string } | null> {
  if (!emails.length && !telefone) return null;
  const { data, error } = await supabase.rpc("teo_compra_black", { p_emails: emails, p_telefone: telefone });
  if (error) throw error;
  const linha = (data as { origem: string; quando: string; email: string }[] | null)?.[0];
  return linha ?? null;
}

function avisoJaComprouBlack(compra: { origem: string; quando: string; email: string }): string {
  const dia = new Date(compra.quando).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
  return [
    `JÁ COMPROU A BLACK (vale acima do MODO BLACK FRIDAY e dos ajustes do dono): este lead comprou a Black Friday Histórica em ${dia} (${compra.origem}, e-mail ${compra.email}).`,
    "Não ofereça nem venda a Black de novo, não mande link de pagamento e não ofereça call de venda.",
    "Se ele escreveu, agradeça a confiança e ajude no que ele pedir. Dúvida de acesso, login, grupos ou conteúdo é com o suporte: chame passar_para_humano (suporte). A exceção é o assistente de IA: veja o aviso do Max.",
    "Se esta for uma mensagem de acompanhamento (retomar a conversa com quem parou de responder), não mande nada: responda só [ENCERRAR].",
  ].join(" ");
}

/**
 * Call que este lead já tem marcada (a próxima). Sem isso, quando a confirmação
 * falhava no envio (Unnichat 502), a rodada seguinte não sabia da call: tratava
 * o horário dela como ocupado por outro e remarcava (Aline e Claudia, 11/11).
 */
async function callMarcadaDoLead(
  supabase: SupabaseClient,
  contactId: string
): Promise<{ inicio: string; vendedor: string | null; meet_url: string | null } | null> {
  const { data } = await supabase
    .from("teo_calls")
    .select("inicio, vendedor, meet_url")
    .eq("contact_id", contactId)
    .neq("status", "cancelada")
    .gte("inicio", new Date(Date.now() - 40 * 60_000).toISOString())
    .order("inicio", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data
    ? {
        inicio: String(data.inicio),
        vendedor: (data.vendedor as string | null) ?? null,
        meet_url: (data.meet_url as string | null) ?? null,
      }
    : null;
}

function avisoCallMarcada(call: { inicio: string; vendedor: string | null; meet_url?: string | null }): string {
  const quando = new Date(call.inicio).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const com = call.vendedor ? ` com ${primeiroNomeVendedor(call.vendedor)}` : "";
  const comecou = new Date(call.inicio).getTime() <= Date.now();
  return [
    comecou
      ? `CALL AGORA: a call deste lead começou ${quando} (horário de Brasília)${com}.`
      : `CALL JÁ MARCADA: este lead tem call ${quando} (horário de Brasília)${com}. Ela já está na agenda e o convite já foi pro e-mail dele.`,
    comecou
      ? ""
      : "Se pela conversa ele ainda não recebeu a confirmação (por exemplo, a sua última mensagem não fala do horário marcado), confirme agora esse horário em uma mensagem curta.",
    "Não marque outro horário e nunca diga que o horário foi preenchido: só chame marcar_call de novo se ele pedir pra mudar.",
    call.meet_url
      ? `NÃO CONSEGUE ENTRAR: se perto do horário ele disser que não consegue entrar (link não abre, pede app, não acha a sala), responda na hora, curto: mande de novo ESTE link da call (${call.meet_url}) e o passo a passo. Celular: precisa do app Microsoft Teams (grátis; ${LOJAS_TEAMS}); depois de instalar, abre o link de novo e toca em "Entrar como convidado", digita o nome e entra. Computador: abre o link no Chrome ou no Edge e escolhe "Continuar neste navegador". Nunca mande outro link (Meet, outra sala), não diga que o especialista já está na sala e não remarque: o especialista foi avisado e entra por esse mesmo link.`
      : "",
  ].filter(Boolean).join(" ");
}

/** Aviso só deste lead (fica fora do bloco da Black, que vai em cache). */
function avisoEmailsSemCompra(emails: string[]): string | null {
  if (!emails.length) return null;
  return `Black, condição de aluno: já conferi e não há compra de curso, imersão ou Encontro nestes e-mails: ${emails.join(", ")}. Se ela disse que é aluna, diga isso com naturalidade e pergunte se comprou com outro e-mail; se não tiver outro, siga com a condição de quem não é aluno (e diga que, se lembrar de outro e-mail, é só mandar).`;
}

// Teste de venda direta: a cada N leads que vão pra call (calls marcadas desde
// venda_teo_desde, um por lead), o próximo lead NOVO sem especialista é do Téo
// (venda_teo = true). Os outros leads novos ficam com venda_teo = false (grupo
// de comparação). A decisão vale pra conversa toda.
async function sortearVendaTeo(supabase: SupabaseClient, cfg: Config, c: Conversa): Promise<boolean> {
  if (c.venda_teo != null) return c.venda_teo;
  const n = cfg.venda_teo_a_cada ?? 0;
  const desde = cfg.venda_teo_desde;
  if (!n || !desde || c.criado_em < desde) return false;
  const [{ data: calls }, { count: doTeo }] = await Promise.all([
    supabase.from("teo_calls").select("contact_id").gte("criado_em", desde),
    supabase
      .from("teo_conversas")
      .select("contact_id", { count: "exact", head: true })
      .eq("venda_teo", true)
      .gte("venda_teo_em", desde),
  ]);
  const leadsComCall = new Set((calls ?? []).map((k) => k.contact_id)).size;
  const vez = leadsComCall >= ((doTeo ?? 0) + 1) * n;
  const { data: marcou } = await supabase
    .from("teo_conversas")
    .update({ venda_teo: vez, venda_teo_em: new Date().toISOString() })
    .eq("contact_id", c.contact_id)
    .is("venda_teo", null)
    .select("contact_id");
  if (!marcou?.length) return false;
  if (vez) {
    await log(supabase, "teste venda do téo: sorteado", { contact_id: c.contact_id, nome: c.nome, leads_com_call: leadsComCall });
    await anotar(
      supabase,
      c.contact_id,
      `🧪 Teste de venda direta: este lead o Téo vai tentar vender sozinho, sem call (1 a cada ${n} leads). Os links dele vão com utm_source=teo. Se o lead pedir uma pessoa, o Téo passa pro time.`
    );
  }
  return vez;
}

// Inscreve sozinho os leads novos da Lista de Espera (fora da Black): quem já
// respondeu a pesquisa entra na hora; quem não respondeu, depois de 15 min.
async function autoInscrever(supabase: SupabaseClient, cfg: Config): Promise<number> {
  if (!cfg.auto_inscrever_ate || new Date(cfg.auto_inscrever_ate) < new Date()) return 0;
  // Desde ontem (horário de Brasília): quem entrou às 23h50 e ainda não
  // respondeu a pesquisa não pode sumir quando vira o dia.
  const ontemSP = new Date(Date.now() - 24 * 3600_000).toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const { data: leads } = await supabase
    .from("leads")
    .select("unnichat_id, name, phone, extra")
    .gte("created_at", ontemSP)
    .not("unnichat_id", "is", null);
  const candidatos = (leads ?? []).filter((l) => {
    const tags = (Array.isArray(l.extra?.tags) ? l.extra.tags : []).map((t: unknown) => String(t).toLowerCase());
    return tags.includes("lista-de-espera") && (blackAtiva(cfg) || !tags.some((t: string) => t.includes("black-2026")));
  });
  if (candidatos.length === 0) return 0;
  const ids = candidatos.map((l) => l.unnichat_id as string);
  const { data: ja } = await supabase.from("teo_conversas").select("contact_id").in("contact_id", ids);
  const jaSet = new Set((ja ?? []).map((r) => r.contact_id));
  let n = 0;
  for (const l of candidatos) {
    const id = l.unnichat_id as string;
    if (jaSet.has(id)) continue;
    // Chega junto em todo mundo: inscreve na hora. Se a janela de 24h ainda
    // não abriu, quem segura é o tratar() (espera ~10 min antes do template).
    const tags = (Array.isArray(l.extra?.tags) ? l.extra.tags : []).map((t: unknown) => String(t).toLowerCase());
    const respondeu = tags.includes("respondeu-pesquisa");
    const { error } = await supabase
      .from("teo_conversas")
      .insert({ contact_id: id, nome: l.name, telefone: l.phone, estado: "novo" });
    if (error) continue;
    if (cfg.atendente_id) {
      await unnichat(supabase, "POST", `/contact/${id}/assign`, { attendantId: cfg.atendente_id });
    }
    await log(supabase, "inscrito", { contact_id: id, nome: l.name, respondeu_pesquisa: respondeu });
    n++;
  }
  return n;
}

// Tag "teo" no Unnichat em todo lead que o Téo assume. A automação "Lista de
// Espera 2.0" usa a tag pra parar as tentativas de contato e não tirar o lead
// do Téo. Pega também quem foi inscrito à mão e repete se a API falhar.
async function marcarTag(supabase: SupabaseClient, cfg: Config): Promise<number> {
  if (!cfg.tag_teo_id) return 0;
  const { data } = await supabase
    .from("teo_conversas")
    .select("contact_id, nome")
    .eq("ativo", true)
    .is("tag_em", null)
    .limit(20);
  let n = 0;
  for (const c of data ?? []) {
    const r = await unnichat(supabase, "POST", `/contact/${c.contact_id}/tags`, { tag_id: cfg.tag_teo_id });
    const ok = r.status >= 200 && r.status < 300 && (r.body as { success?: boolean } | null)?.success !== false;
    if (!ok) {
      await log(supabase, "tag falhou", { contact_id: c.contact_id, nome: c.nome, status: r.status });
      continue;
    }
    await supabase.from("teo_conversas").update({ tag_em: new Date().toISOString() }).eq("contact_id", c.contact_id);
    n++;
  }
  return n;
}

// "2026-11-03T10:00:00-03:00" -> "2026-11-03T10:00" (horário de Brasília)
function local(iso: string): string {
  return new Date(iso)
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .slice(0, 16)
    .replace(" ", "T");
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Quem do time já conversou com o lead (mensagem digitada no Unnichat nos
// últimos DONO_RECENTE_DIAS dias; era 30 até 14/11, o Fernando pediu 15). Se tem alguém, a call é com essa pessoa. A API não diz
// quem mandou cada mensagem: vale quem estava com a conversa naquela hora,
// pelos avisos "Conversa atribuída … ao Fulano" (o Unnichat também atribui a
// quem manda mensagem numa conversa sem dono).
// A venda é de quem vende agora (Fernando, 14/11): contato do vendedor (mensagem
// ou call) mais antigo que isto não prende o lead. Mesmo prazo em lib/teo-entrada.
const DONO_RECENTE_DIAS = 15;

function especialistaDaConversa(msgs: MsgUnnichat[], cfg: Config): string | null {
  const vendedores = (cfg.vendedores ?? []).map((v) => v.nome);
  const desde = Date.now() - DONO_RECENTE_DIAS * 86400_000;
  let atual: string | null = null;
  let dono: string | null = null;
  for (const m of msgs) {
    const txt = m.message ?? "";
    if (m.senderBy === "platform") {
      if (/desatribu/i.test(txt)) atual = null;
      else if (/atribu[ií]da/i.test(txt)) atual = vendedores.find((v) => semAcento(txt).includes(semAcento(v))) ?? null;
      continue;
    }
    // Só mensagem digitada por gente: sem automação, API (o Téo), nota ou
    // template de campanha.
    if (m.senderBy !== "user" || m.origin || ["note", "template", "info", "flow"].includes(m.type)) continue;
    if (/\bt[eé]o\b/i.test(txt)) continue; // abertura do Téo mandada à mão
    if (atual && new Date(m.date).getTime() >= desde) dono = atual;
  }
  return dono;
}

// Fechamento em call de cada vendedor nos últimos 90 dias, com a mesma régua
// do Painel Calls (função teo_fechamento_em_call → painel_calls do banco): das
// calls do Téo que aconteceram (gravação no Teams, nota #call do vendedor ou
// marcação no painel), quantas viraram venda paga em até 48h, ligada pelo
// e-mail, telefone ou nome. Só desempata a divisão do dia, que é igual entre os vendedores.
// Até 12/11 era a conversão geral (vendas ÷ leads); o Fernando pediu a de call.
const JANELA_FECHAMENTO_DIAS = 90;

async function taxasDeFechamentoEmCall(
  supabase: SupabaseClient,
  nomes: string[]
): Promise<Map<string, number>> {
  const { data } = await supabase.rpc("teo_fechamento_em_call", { p_dias: JANELA_FECHAMENTO_DIAS });
  const linhas = (data ?? []) as { vendedor: string; calls: number; fechamentos: number }[];
  return new Map(
    nomes.map((nome) => {
      const l = linhas.find((x) => x.vendedor === nome);
      return [nome, l && Number(l.calls) > 0 ? Number(l.fechamentos) / Number(l.calls) : 0];
    })
  );
}

// Quem pega a próxima call do dia: as calls do dia são divididas igualmente
// (vai quem tem menos calls no dia) e o fechamento em call só desempata, então
// a call que sobra quando o dia não divide por 3 fica com quem fecha mais nas
// calls. Ex.: 7 calls com fechamentos de 33%, 14% e 0% dão 3, 2 e 2. (Até
// 12/11 a divisão era na proporção da conversão geral; o Fernando pediu
// divisão igual, desempatada pelo fechamento em call.)
function ordemDoDia(livres: string[], cargaNoDia: (v: string) => number, taxa: Map<string, number>): string[] {
  const t = (v: string) => taxa.get(v) ?? 0;
  return [...livres].sort((a, b) => cargaNoDia(a) - cargaNoDia(b) || t(b) - t(a));
}

// O lead é do vendedor da primeira call que o Téo marcou pra ele: remarcação
// é sempre com essa pessoa (se ainda estiver no time), nunca troca. Só vale
// call dos últimos DONO_RECENTE_DIAS dias (ou futura): call antiga não prende o lead, a venda
// é de quem vende agora (Fernando, 14/11). Mesma janela da mensagem do
// vendedor em especialistaDaConversa().
async function vendedorDoLead(supabase: SupabaseClient, cfg: Config, contato: string): Promise<string | null> {
  const { data } = await supabase
    .from("teo_calls")
    .select("vendedor")
    .eq("contact_id", contato)
    .not("vendedor", "is", null)
    .gte("inicio", new Date(Date.now() - DONO_RECENTE_DIAS * 86400_000).toISOString())
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle();
  const v = (data?.vendedor as string | null) ?? null;
  return v && (cfg.vendedores ?? []).some((x) => x.nome === v) ? v : null;
}

// Horários da config daqui a 1h+ em que algum vendedor está livre. Os três
// atendem em paralelo (cada um no seu computador): o mesmo horário aceita uma
// call por vendedor. Em cada horário vai o vendedor livre que ordemDoDia()
// escolhe. Se alguém do time já conversou com o lead, só os horários dessa
// pessoa.
async function horariosLivres(
  supabase: SupabaseClient,
  cfg: Config,
  especialista: string | null = null,
  // Remarcação: as calls que o próprio lead já tem não ocupam a agenda pra ele
  // (a call nova substitui a antiga).
  contato: string | null = null
): Promise<{ horario: string; vendedor: string }[]> {
  const time = (cfg.vendedores ?? []).map((v) => v.nome);
  const vendedores = especialista && time.includes(especialista) ? [especialista] : time;
  const todos = (cfg.horarios ?? []).filter(
    (h) => typeof h === "string" && new Date(h).getTime() > Date.now() + 3600_000
  );
  if (todos.length === 0 || vendedores.length === 0) return [];
  const [{ data: marcadas }, taxa] = await Promise.all([
    supabase
      .from("teo_calls")
      .select("inicio, vendedor, contact_id")
      .neq("status", "cancelada")
      .gte("inicio", new Date(Date.now() - 12 * 3600_000).toISOString()),
    taxasDeFechamentoEmCall(supabase, time),
  ]);
  // Entre o início de uma call e o da próxima do mesmo vendedor, no mínimo 1h
  // (a call continua com 30 min no convite; a meia hora que sobra é folga).
  const INTERVALO_MS = 60 * 60_000;
  if (contato && marcadas) {
    for (let i = marcadas.length - 1; i >= 0; i--) if (marcadas[i].contact_id === contato) marcadas.splice(i, 1);
  }
  const inicios = new Map<string, number[]>();
  for (const m of marcadas ?? []) {
    if (!m.vendedor) continue;
    const lista = inicios.get(m.vendedor) ?? [];
    lista.push(new Date(m.inicio).getTime());
    inicios.set(m.vendedor, lista);
  }
  const ocupado = (ts: number, v: string) => (inicios.get(v) ?? []).some((t) => Math.abs(t - ts) < INTERVALO_MS);
  // Calls de vendedores diferentes podem acontecer no mesmo horário (cada um
  // no seu computador): o Téo oferece os horários mais próximos, sem evitar
  // sobreposição. (De 04/11 a 12/11 ele preferia horário sem call de outro
  // vendedor e as calls do dia ficavam todas em fila; o Fernando pediu pra
  // liberar.)
  const dia = (iso: string) => local(iso).slice(0, 10);
  const carga = new Map<string, number>();
  for (const m of marcadas ?? []) {
    if (m.vendedor) carga.set(`${dia(m.inicio)}|${m.vendedor}`, (carga.get(`${dia(m.inicio)}|${m.vendedor}`) ?? 0) + 1);
  }
  const out: { horario: string; vendedor: string }[] = [];
  for (const h of todos) {
    const ts = new Date(h).getTime();
    const livres = vendedores.filter((v) => !ocupado(ts, v));
    if (livres.length === 0) continue;
    const [escolhido] = ordemDoDia(livres, (v) => carga.get(`${dia(h)}|${v}`) ?? 0, taxa);
    out.push({ horario: local(h), vendedor: escolhido });
  }
  return out;
}

type CallConvite = {
  id: string;
  nome: string | null;
  inicio: string;
  email: string | null;
  vendedor: string | null;
  resumo: string | null;
  /** evento de um convite anterior (reenvio): é cancelado antes do novo */
  evento_id?: string | null;
};

// Acesso à agenda do organizador (anfitriao@) pela Graph: token do app e a URL
// dos eventos. null quando o Teams/Graph não está configurado.
async function graph(
  supabase: SupabaseClient,
  cfg: Config
): Promise<{ ok: true; base: string; auth: Record<string, string> } | { ok: false; erro: string } | null> {
  if (!cfg.teams_organizador) return null;
  const t = await graphToken(supabase, cfg);
  if (!t?.ok) return t;
  return {
    ok: true,
    base: `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.teams_organizador)}/events`,
    auth: t.auth,
  };
}

// Convite com a sala fixa do vendedor (link de uma sala que ele mesmo hospeda):
// evento na agenda do organizador, sem reunião online, com o link no local e
// na descrição. A Graph manda o convite pros convidados.
// Reunião do Teams criada direto pela API de reuniões online, em nome do
// organizador (anfitriao@): não depende do calendário aceitar Teams. Lobby
// liberado pra todos, gravação automática e o vendedor como apresentador. Pede a
// permissão de aplicativo OnlineMeetings.ReadWrite.All e a política de acesso
// do Teams (Grant-CsApplicationAccessPolicy) pro anfitriao@; sem elas, a Graph
// responde 403 e quem chamou segue pra sala fixa.
async function criarReuniaoOnline(
  supabase: SupabaseClient,
  cfg: Config,
  k: CallConvite,
  dados: { titulo: string; vendedorEmail?: string | null }
): Promise<{ ok: true; link: string; id: string | null } | { ok: false; erro: string } | null> {
  if (!cfg.teams_organizador_id) return null;
  const g = await graph(supabase, cfg);
  if (!g) return null;
  if (!g.ok) return { ok: false, erro: g.erro };
  const inicio = new Date(k.inicio);
  const fim = new Date(inicio.getTime() + 30 * 60_000);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${cfg.teams_organizador_id}/onlineMeetings`, {
    method: "POST",
    headers: g.auth,
    body: JSON.stringify({
      subject: dados.titulo,
      startDateTime: inicio.toISOString(),
      endDateTime: fim.toISOString(),
      lobbyBypassSettings: { scope: "everyone", isDialInBypassEnabled: true },
      recordAutomatically: true,
      meetingSpokenLanguageTag: "pt-BR",
      allowedPresenters: dados.vendedorEmail ? "roleIsPresenter" : "organization",
      participants: dados.vendedorEmail
        ? { attendees: [{ upn: dados.vendedorEmail, role: "presenter" }] }
        : undefined,
    }),
  });
  const m = (await res.json().catch(() => null)) as
    | { id?: string; joinWebUrl?: string; error?: { message?: string } }
    | null;
  if (!res.ok || !m?.joinWebUrl) {
    return { ok: false, erro: `reunião online ${res.status}: ${(m?.error?.message ?? "").slice(0, 200)}` };
  }
  return { ok: true, link: m.joinWebUrl, id: m.id ?? null };
}

// Escada de cupons pro Téo (só quando ele vende por aqui). A ordem e os
// limites seguem o roteiro: R$ 2.997 sempre primeiro; R$ 2.797 só na objeção
// de preço; R$ 2.497 só com trava concreta; pediu mais, bônus do Booking e
// não baixa mais. O Téo "vê com a equipe" e volta uns minutos depois.
const CUPOM_ESPERA_MS = 4 * 60_000;

function blocoCupons(cfg: Config): string {
  const lista = (cfg.cupons ?? [])
    .slice()
    .sort((a, b) => a.produto.localeCompare(b.produto) || a.degrau - b.degrau);
  if (!lista.length) return "";
  const pub = (c: Cupom) =>
    c.publico === "aluno"
      ? " Só pra aluno confirmado pelo sistema."
      : c.publico === "aluno_curso"
        ? " Só pra quem comprou curso (imersão ou Encontro não basta)."
        : c.publico === "nao_aluno"
          ? " Só pra quem não é aluno."
          : "";
  return [
    "# Cupons (só quando você estiver vendendo por aqui, sem call)",
    "O cupom não é atalho nem isca. Só chega nele quem passou pelo roteiro: ela já contou a dor, já entendeu o que o produto resolve pra ela, quer, e o que trava é o valor. Se ela ainda não viu valor, o próximo passo é o roteiro (descobrir, ciclo da dor, vender a viagem), não o cupom. Nunca ofereça cupom de cara, nunca pra quem não falou de preço e nunca cupom fora desta lista.",
    "Ordem: preço da tabela sempre primeiro, no fechamento. Na objeção de preço, primeiro trate o \"caro\" como na seção \"Objeções\" (o total, a parcela ou o retorno? a conta com os números dela). Se mesmo assim o preço continuar travando, aí sim o primeiro degrau. Cada degrau seguinte só com uma nova trava concreta dela (ex.: \"a parcela não cabe\", \"só consigo até tanto\"), um por vez, na ordem.",
    "Como: diga com naturalidade que vai ver com a equipe o que dá pra fazer (ex.: \"deixa eu ver aqui com a equipe se consigo algo melhor pra você, já te volto\"), sem citar valor nem prometer, e chame pedir_cupom. Em alguns minutos a resposta da equipe chega pra você. Nunca diga que a equipe já aprovou antes disso. A partir do segundo degrau, ao voltar, use algo como \"conversei com a equipe e consegui aprovar\".",
    ...lista.map(
      (c) => `- ${c.produto}, degrau ${c.degrau} (${c.codigo}): ${c.condicao}. Quando: ${c.quando}.${pub(c)}`
    ),
    "Depois do último degrau não tem mais desconto: segure o preço e volte pro valor (a dor dela, o retorno, a garantia). Cupom com boleto parcelado não existe: se ela quiser boleto com a condição, chame passar_para_humano (motivo \"comprar\").",
  ].join("\n");
}

function linkComUtm(link: string, utm: string): string {
  return `${link}${link.includes("?") ? "&" : "?"}utm_source=${utm}`;
}

function utmDoLead(especialista: string | null): string {
  if (!especialista) return "teo";
  return primeiroNomeVendedor(especialista)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function textoCondicao(p: CupomPedido): string {
  return [
    `${p.produto}: ${p.condicao} (cupom ${p.codigo})`,
    p.link ? `link: ${p.link}` : "sem link aqui: quando ela topar, chame passar_para_humano (motivo \"comprar\")",
    p.bonus ? "O bônus o time libera depois da compra." : "",
  ]
    .filter(Boolean)
    .join(". ");
}

// O que o Téo sabe do cupom pedido, em toda resposta (fora do cache).
function avisoCupom(p: CupomPedido, respondida: boolean): string {
  if (!respondida) {
    return `CUPOM: você pediu à equipe uma condição pra ela (${p.produto}, cupom ${p.codigo}) e a resposta ainda não chegou. Se ela perguntar, diga que ainda está vendo com a equipe; não cite valor nem prometa.`;
  }
  return [
    `CUPOM APROVADO pela equipe pra ela — ${textoCondicao(p)}.`,
    "Use quando for o próximo passo natural da conversa: se o preço era o que travava, volte com a condição ligada ao que ela contou (a dor, o objetivo) e pergunte se assim fica bom pra começar; o link vai quando ela topar (ou junto, se ela já disse que compra com essa condição). Se a conversa mudou de rumo, siga o rumo e guarde a condição pra quando o preço voltar.",
    "Não volte ao preço da tabela e não desça mais sem uma nova trava concreta (aí é o próximo degrau da seção \"Cupons\", se houver).",
  ].join(" ");
}

// Rodada em que a resposta da "equipe" chega e o lead não escreveu nada desde
// o "vou ver com a equipe".
function instrucaoCupom(p: CupomPedido): string {
  return (
    `[Instrução interna, o lead não vê: a equipe acabou de responder o pedido de condição que você fez. ${avisoCupom(p, true)} ` +
    "Releia a conversa antes de escrever. Se ela está esperando essa resposta, volte agora, curto e natural (ex.: \"consegui uma condição aqui pra você\"), sem textão e sem repetir o que já disse. " +
    "Se ela já comprou, desistiu, pediu pra parar ou a conversa foi pra outro lado, não empurre o cupom: responda só [SEM_RESPOSTA].]"
  );
}

async function pedirCupom(
  supabase: SupabaseClient,
  c: Conversa,
  cfg: Config,
  o: { liberado: boolean; aluno: boolean; alunoCurso: boolean; utm: string },
  args: { codigo: string; motivo: string }
): Promise<string> {
  if (!o.liberado) {
    return "Cupom não está liberado pra este lead (você não está vendendo por aqui): siga com o preço da tabela; condição especial é com o especialista.";
  }
  const lista = cfg.cupons ?? [];
  const cup = lista.find((x) => x.codigo.toUpperCase() === args.codigo.trim().toUpperCase());
  if (!cup) return 'Esse cupom não existe. Use só os códigos da seção "Cupons".';
  if (cup.publico === "aluno" && !o.aluno) {
    return "Esse cupom é só pra aluno confirmado pelo sistema, e o cadastro dela não mostra compra de curso, imersão ou Encontro. Se ela disser que é aluna, peça o e-mail da compra; não peça o cupom agora.";
  }
  if (cup.publico === "aluno_curso" && !o.alunoCurso) {
    return "Esse cupom é só pra quem já comprou curso (imersão ou Encontro não basta). Siga com o preço da tabela.";
  }
  if (cup.publico === "nao_aluno" && o.aluno) return "Esse cupom é pra quem não é aluno; ela é aluna e já tem a condição de aluno.";
  const ant = c.cupom_pendente ?? null;
  if (ant && !ant.respondida_em) {
    return "Você já pediu uma condição à equipe e a resposta ainda não chegou. Diga só que ainda está vendo; não peça outra.";
  }
  const ultimo = ant && ant.produto === cup.produto ? ant.degrau : 0;
  if (cup.degrau <= ultimo) return `Ela já tem essa condição ou uma melhor aprovada (${ant!.condicao}). Mantenha essa.`;
  if (cup.degrau > ultimo + 1) {
    const prox = lista.find((x) => x.produto === cup.produto && x.degrau === ultimo + 1);
    return prox
      ? `Um degrau por vez: o próximo é ${prox.codigo} (${prox.condicao}), e só se ela trouxer uma trava concreta de preço.`
      : 'Um degrau por vez, na ordem da seção "Cupons".';
  }
  const agora = new Date();
  const pedido: CupomPedido = {
    codigo: cup.codigo,
    produto: cup.produto,
    degrau: cup.degrau,
    condicao: cup.condicao,
    link: cup.link ? linkComUtm(cup.link, o.utm) : null,
    bonus: cup.bonus ?? false,
    motivo: args.motivo.slice(0, 300),
    pedido_em: agora.toISOString(),
    respondida_em: null,
  };
  const em = new Date(agora.getTime() + CUPOM_ESPERA_MS).toISOString();
  const { error } = await supabase
    .from("teo_conversas")
    .update({ cupom_pendente: pedido, cupom_em: em })
    .eq("contact_id", c.contact_id);
  if (error) return "Não deu pra pedir agora. Siga com o preço da tabela e trate o valor pelo roteiro.";
  c.cupom_pendente = pedido;
  c.cupom_em = em;
  await anotar(
    supabase,
    c.contact_id,
    `🎟️ Téo pediu condição (venda por aqui): ${cup.produto} — ${cup.condicao} (cupom ${cup.codigo}).\nO que trava: ${pedido.motivo}\nEle volta com a condição em ~4 min.${cup.bonus ? "\nSe ela comprar, liberar o bônus." : ""}`
  );
  await log(supabase, "cupom pedido", { contact_id: c.contact_id, nome: c.nome, cupom: cup.codigo, motivo: pedido.motivo });
  return "Pedido feito à equipe. Agora diga, curto e natural, que vai ver com a equipe e já volta (sem citar valor e sem prometer). A resposta chega em alguns minutos.";
}

// Marca no webhook_log de que a reunião já foi ajustada. Muda quando o ajuste
// muda, pra repassar nas reuniões já ligadas: "(pt-BR)" quando o idioma passou
// a ir junto; "sem sala de espera" desde 14/11.
const MARCA_GRAVACAO = "gravação automática ligada (pt-BR, sem sala de espera)";

// App do Teams pro lead que entra pelo celular (o link da call pede o app).
// No lembrete vai só o texto (um link por mensagem: mensagem cheia de link
// parece spam e bloqueio derruba a qualidade do número); os links das lojas
// vão só pra quem disser que não consegue entrar.
const APP_TEAMS =
  "Se for entrar pelo celular, baixe antes o app Microsoft Teams (grátis, na loja do celular): dá pra entrar como convidado, só com o seu nome, sem criar conta. No computador, abre direto no navegador.";
const LOJAS_TEAMS =
  "Android: https://play.google.com/store/apps/details?id=com.microsoft.teams · iPhone: https://apps.apple.com/br/app/microsoft-teams/id1113153706";
const NAO_CONSIGO_ENTRAR_RE =
  /(n[aã]o (consigo|consegui|estou conseguindo|t[oô] conseguindo)|n[aã]o (abre|abriu|carrega|entra|funciona)|\blink\b|aplicativo|\bapp\b|baixar|inv[aá]lido|como (eu )?entro|cad[eê] (a sala|voc[eê]|o link))/i;

// Liga "gravar e transcrever automaticamente" na reunião do Teams da call,
// direto na reunião (vale mesmo pra reunião criada pela agenda e não depende
// do vendedor lembrar). Acha a reunião pelo link quando não temos o id.
// Fixa o idioma falado em pt-BR: sem isso a Teams transcreve como inglês
// (en-US) e a transcrição sai sem sentido.
async function ligarGravacao(
  supabase: SupabaseClient,
  cfg: Config,
  k: { id: string; nome: string | null; meet_url: string | null; reuniao_id?: string | null }
): Promise<"ok" | string> {
  if (!cfg.teams_organizador_id || !k.meet_url?.includes("teams.microsoft.com")) return "sem teams";
  const g = await graph(supabase, cfg);
  if (!g?.ok) return g ? g.erro : "sem graph";
  const base = `https://graph.microsoft.com/v1.0/users/${cfg.teams_organizador_id}/onlineMeetings`;
  let id = k.reuniao_id ?? null;
  if (!id) {
    const filtro = encodeURIComponent(`JoinWebUrl eq '${k.meet_url.replace(/'/g, "''")}'`);
    const r = await fetch(`${base}?$filter=${filtro}`, { headers: g.auth });
    const j = (await r.json().catch(() => null)) as { value?: { id?: string }[]; error?: { message?: string } } | null;
    id = j?.value?.[0]?.id ?? null;
    if (!id) return `reunião não achada (${r.status} ${(j?.error?.message ?? "").slice(0, 120)})`;
  }
  const res = await fetch(`${base}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: g.auth,
    // Sem sala de espera: o lead entra direto (em 12/11 a Caroline ficou
    // "aguardando aprovação" e ninguém aprovou).
    body: JSON.stringify({
      recordAutomatically: true,
      meetingSpokenLanguageTag: "pt-BR",
      lobbyBypassSettings: { scope: "everyone", isDialInBypassEnabled: true },
    }),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return `PATCH ${res.status}: ${(e?.error?.message ?? "").slice(0, 160)}`;
  }
  return "ok";
}

async function criarComSala(
  supabase: SupabaseClient,
  cfg: Config,
  k: CallConvite,
  dados: { titulo: string; descricao: string; inicio: string; fim: string; convidados: string[]; sala: string; tag?: string }
): Promise<{ ok: true; id: string } | { ok: false; erro: string } | null> {
  const g = await graph(supabase, cfg);
  if (!g) return null;
  if (!g.ok) return { ok: false, erro: g.erro };
  const res = await fetch(g.base, {
    method: "POST",
    headers: g.auth,
    body: JSON.stringify({
      subject: dados.titulo,
      body: { contentType: "text", content: dados.descricao },
      start: { dateTime: dados.inicio, timeZone: "America/Sao_Paulo" },
      end: { dateTime: dados.fim, timeZone: "America/Sao_Paulo" },
      location: { displayName: dados.sala, locationUri: dados.sala },
      attendees: dados.convidados.map((e) => ({ emailAddress: { address: e }, type: "required" })),
      allowNewTimeProposals: false,
      transactionId: `${k.id}-${dados.tag ?? "sala"}`,
    }),
  });
  const ev = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!res.ok || !ev?.id) return { ok: false, erro: `evento ${res.status}: ${(ev?.error?.message ?? "").slice(0, 200)}` };
  return { ok: true, id: ev.id };
}

// Reunião do Teams pela Microsoft Graph, na agenda do organizador
// ("Canal do Anfitrião"), com o lead e o vendedor convidados. A Graph manda o
// convite por e-mail a cada um. Devolve null se o Teams não está configurado.
async function criarTeams(
  supabase: SupabaseClient,
  cfg: Config,
  k: CallConvite,
  dados: { titulo: string; descricao: string; inicio: string; fim: string; convidados: string[] }
): Promise<{ ok: true; id: string; link: string } | { ok: false; erro: string } | null> {
  const g = await graph(supabase, cfg);
  if (!g) return null;
  if (!g.ok) return { ok: false, erro: g.erro };
  const { base, auth } = g;
  // 1) Cria a reunião SEM convidados (ninguém recebe nada ainda) e confere se
  // veio o link do Teams. Conta nova pode levar horas pra ter o Teams ativo:
  // sem link, apaga em silêncio e quem chamou usa o Meet.
  const res = await fetch(base, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      subject: dados.titulo,
      body: { contentType: "text", content: dados.descricao },
      start: { dateTime: dados.inicio, timeZone: "America/Sao_Paulo" },
      end: { dateTime: dados.fim, timeZone: "America/Sao_Paulo" },
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      allowNewTimeProposals: false,
      transactionId: k.id,
    }),
  });
  type Evento = {
    id?: string;
    isOnlineMeeting?: boolean;
    onlineMeetingProvider?: string;
    onlineMeeting?: { joinUrl?: string } | null;
    error?: { message?: string };
  };
  const ev = (await res.json().catch(() => null)) as Evento | null;
  if (!res.ok || !ev?.id) {
    return { ok: false, erro: `evento ${res.status}: ${(ev?.error?.message ?? "").slice(0, 200)}` };
  }
  // O link do Teams às vezes só aparece uns segundos depois de criar o evento:
  // relê algumas vezes antes de desistir.
  let link = ev.onlineMeeting?.joinUrl;
  let visto: Evento = ev;
  for (let i = 0; !link && i < 4; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const r = await fetch(`${base}/${ev.id}?$select=isOnlineMeeting,onlineMeetingProvider,onlineMeeting`, {
      headers: auth,
    }).catch(() => null);
    const e = (await r?.json().catch(() => null)) as Evento | null;
    if (e) visto = e;
    link = e?.onlineMeeting?.joinUrl;
  }
  if (!link) {
    await fetch(`${base}/${ev.id}`, { method: "DELETE", headers: auth }).catch(() => null);
    // Diagnóstico: o que o calendário do organizador aceita de reunião online.
    const cal = await fetch(
      `${base.replace(/\/events$/, "")}/calendar?$select=allowedOnlineMeetingProviders,defaultOnlineMeetingProvider`,
      { headers: auth }
    ).catch(() => null);
    const c = (await cal?.json().catch(() => null)) as
      | { allowedOnlineMeetingProviders?: string[]; defaultOnlineMeetingProvider?: string; error?: { message?: string } }
      | null;
    return {
      ok: false,
      erro:
        `reunião criada sem link do Teams (isOnlineMeeting=${visto.isOnlineMeeting}, provider=${visto.onlineMeetingProvider}; ` +
        `calendário aceita=${JSON.stringify(c?.allowedOnlineMeetingProviders ?? c?.error?.message ?? null)}, padrão=${c?.defaultOnlineMeetingProvider})`,
    };
  }
  // 2) Com o link garantido, convida o lead e o vendedor (a Graph manda o convite).
  const conv = await fetch(`${base}/${ev.id}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({
      attendees: dados.convidados.map((e) => ({ emailAddress: { address: e }, type: "required" })),
    }),
  });
  if (!conv.ok) {
    await fetch(`${base}/${ev.id}`, { method: "DELETE", headers: auth }).catch(() => null);
    return { ok: false, erro: `convidados ${conv.status}` };
  }
  return { ok: true, id: ev.id, link };
}

// Cria a reunião e manda o convite pro lead e pro vendedor: primeiro pelo
// Teams; se não estiver configurado ou falhar, pelo Google Meet (Apps Script
// em teo_agenda_url). Sem nenhum dos dois, a call fica "marcada" e é tentada
// de novo na próxima rodada.
async function criarConvite(supabase: SupabaseClient, cfg: Config, k: CallConvite): Promise<boolean> {
  // Reenvio: cancela o convite anterior que está na agenda do anfitriao@ (sala
  // fixa ou Teams). A Graph manda o "evento cancelado" pros convidados. Convite
  // antigo do Meet (Apps Script) não está nessa agenda: a Graph responde 404 e
  // segue.
  if (k.evento_id) {
    const g = await graph(supabase, cfg).catch(() => null);
    if (g?.ok) {
      const r = await fetch(`${g.base}/${encodeURIComponent(k.evento_id)}/cancel`, {
        method: "POST",
        headers: g.auth,
        body: JSON.stringify({ comment: "Mudamos a sala da sua call. O convite novo chega em seguida." }),
      }).catch(() => null);
      if (r?.ok) await log(supabase, "convite anterior cancelado", { call_id: k.id, nome: k.nome });
    }
    await supabase.from("teo_calls").update({ evento_id: null }).eq("id", k.id);
  }
  const v = (cfg.vendedores ?? []).find((x) => x.nome === k.vendedor);
  const convidados = [k.email, v?.email].filter((e): e is string => Boolean(e));
  const inicio = `${local(k.inicio)}:00`;
  const fim = `${local(new Date(new Date(k.inicio).getTime() + 30 * 60_000).toISOString())}:00`;
  const titulo = `Canal do Anfitrião: ${k.nome ?? "lead"} e ${k.vendedor ? primeiroNomeVendedor(k.vendedor) : "especialista"}`;
  // O lead também vê a descrição: só o texto neutro. A ficha vai pro vendedor
  // na nota do Unnichat.
  // No Teams a reunião grava sozinha (política "Calls Canal do Anfitrião" do
  // organizador); no Meet, não. Só avisa quando grava de verdade.
  const descricao = (comoEntrar: string, gravada: boolean) =>
    `Papo de 20 min com ${k.vendedor ?? "um especialista"}, do Canal do Anfitrião, pra entender o seu cenário e te mostrar como o curso funciona e se faz sentido pro seu momento. ${comoEntrar}${gravada ? " A conversa é gravada." : ""}`;

  const teams = await criarTeams(supabase, cfg, k, {
    titulo,
    descricao: descricao("É só entrar pelo link do Teams no horário.", true),
    inicio,
    fim,
    convidados,
  }).catch((e) => ({ ok: false as const, erro: e instanceof Error ? e.message : String(e) }));
  if (teams?.ok) {
    await supabase
      .from("teo_calls")
      .update({ status: "convite_enviado", evento_id: teams.id, meet_url: teams.link })
      .eq("id", k.id);
    await log(supabase, "convite enviado", { call_id: k.id, nome: k.nome, convidados, sala: "teams", link: teams.link });
    return true;
  }
  if (teams && !teams.ok) {
    await log(supabase, "teams falhou", { call_id: k.id, nome: k.nome, erro: teams.erro });
  }

  // Sem link do calendário: reunião do Teams pela API de reuniões online (grava
  // sozinha) e o convite como evento comum com o link.
  const online = await criarReuniaoOnline(supabase, cfg, k, { titulo, vendedorEmail: v?.email }).catch((e) => ({
    ok: false as const,
    erro: e instanceof Error ? e.message : String(e),
  }));
  if (online?.ok) {
    const r = await criarComSala(supabase, cfg, k, {
      titulo,
      descricao: descricao(`É só entrar por este link do Teams no horário: ${online.link}`, true),
      inicio,
      fim,
      convidados,
      sala: online.link,
      tag: "online",
    }).catch((e) => ({ ok: false as const, erro: e instanceof Error ? e.message : String(e) }));
    if (r?.ok) {
      await supabase
        .from("teo_calls")
        .update({ status: "convite_enviado", evento_id: r.id, meet_url: online.link, reuniao_id: online.id })
        .eq("id", k.id);
      await log(supabase, "convite enviado", { call_id: k.id, nome: k.nome, convidados, sala: "teams-api", link: online.link });
      return true;
    }
    if (r && !r.ok) await log(supabase, "convite teams-api falhou", { call_id: k.id, nome: k.nome, erro: r.erro });
  } else if (online && !online.ok) {
    await log(supabase, "reunião online falhou", { call_id: k.id, nome: k.nome, erro: online.erro });
  }

  // Sem Teams: a sala fixa do vendedor, se ele tiver uma (teo_config.vendedores[].sala).
  const salaFixa = v?.sala?.trim();
  if (salaFixa) {
    const r = await criarComSala(supabase, cfg, k, {
      titulo,
      descricao: descricao(`É só entrar por este link no horário: ${salaFixa}`, false),
      inicio,
      fim,
      convidados,
      sala: salaFixa,
    }).catch((e) => ({ ok: false as const, erro: e instanceof Error ? e.message : String(e) }));
    if (r?.ok) {
      await supabase
        .from("teo_calls")
        .update({ status: "convite_enviado", evento_id: r.id, meet_url: salaFixa })
        .eq("id", k.id);
      await log(supabase, "convite enviado", { call_id: k.id, nome: k.nome, convidados, sala: "fixa", link: salaFixa });
      return true;
    }
    if (r && !r.ok) await log(supabase, "sala fixa falhou", { call_id: k.id, nome: k.nome, erro: r.erro });
  }

  const { data: ag } = await supabase.rpc("teo_agenda_config");
  const url = (ag as { url?: string } | null)?.url;
  const token = (ag as { token?: string } | null)?.token;
  if (!url || !token) return false;
  const res = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, titulo, descricao: descricao("É só entrar pelo link do Google Meet no horário.", false), inicio, fim, convidados }),
  });
  const out = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; meet?: string; erro?: string } | null;
  if (!out?.ok) {
    await log(supabase, "convite falhou", { call_id: k.id, nome: k.nome, status: res.status, erro: out?.erro ?? null });
    return false;
  }
  await supabase
    .from("teo_calls")
    .update({ status: "convite_enviado", evento_id: out.id ?? null, meet_url: out.meet ?? null })
    .eq("id", k.id);
  await log(supabase, "convite enviado", { call_id: k.id, nome: k.nome, convidados, sala: "meet", meet: out.meet ?? null });
  return true;
}

function primeiroNomeVendedor(nome: string): string {
  return nome.split(" ")[0];
}

async function marcarCall(
  supabase: SupabaseClient,
  c: Conversa,
  cfg: Config,
  especialista: string | null,
  args: { horario: string; email: string; resumo: string }
): Promise<string> {
  const livres = await horariosLivres(supabase, cfg, especialista, c.contact_id);
  const horario = args.horario.trim().slice(0, 16);
  const slot = livres.find((l) => l.horario === horario);
  const lista = (ls: typeof livres) =>
    ls
      .slice(0, 8)
      .map((l) => `${l.horario} (com ${primeiroNomeVendedor(l.vendedor)})`)
      .join(", ") || "nenhum";
  if (!slot) {
    return `Esse horário não está livre. Livres agora: ${lista(livres)}.`;
  }
  const email = args.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "E-mail inválido: peça o e-mail de novo.";
  const { data: nova, error } = await supabase
    .from("teo_calls")
    .insert({
      contact_id: c.contact_id,
      nome: c.nome,
      inicio: `${horario}:00-03:00`,
      email,
      resumo: args.resumo,
      vendedor: slot.vendedor,
    })
    .select("id, nome, inicio, email, vendedor, resumo")
    .single();
  if (error) {
    return /duplicate|unique/i.test(error.message)
      ? `Esse horário acabou de ser ocupado. Livres agora: ${lista(await horariosLivres(supabase, cfg, especialista, c.contact_id))}.`
      : `Não consegui marcar (${error.message}). Diga que vai confirmar o horário e chame passar_para_humano.`;
  }
  const [dia, hora] = horario.split("T");
  const quando = `${dia.slice(8, 10)}/${dia.slice(5, 7)} às ${hora}`;
  await anotar(
    supabase,
    c.contact_id,
    `📅 Call marcada pelo Téo: ${quando} com ${slot.vendedor} — ${email}\n${args.resumo}`
  );
  await log(supabase, "call marcada", { contact_id: c.contact_id, nome: c.nome, horario, email, vendedor: slot.vendedor });
  // Remarcação: a call nova substitui as outras do lead que ainda não
  // aconteceram (senão a antiga continua mandando lembrete e "te esperando").
  // O convite antigo é cancelado na agenda, e a Graph avisa o lead e o vendedor.
  if (nova) {
    const { data: antigas } = await supabase
      .from("teo_calls")
      .select("id, nome, inicio, evento_id")
      .eq("contact_id", c.contact_id)
      .neq("id", nova.id)
      .neq("status", "cancelada")
      .gte("inicio", new Date().toISOString());
    for (const a of antigas ?? []) {
      await supabase.from("teo_calls").update({ status: "cancelada" }).eq("id", a.id);
      if (a.evento_id) {
        const g = await graph(supabase, cfg).catch(() => null);
        if (g?.ok) {
          await fetch(`${g.base}/${encodeURIComponent(a.evento_id)}/cancel`, {
            method: "POST",
            headers: g.auth,
            body: JSON.stringify({ comment: `Sua call foi remarcada para ${quando}. O convite novo chega em seguida.` }),
          }).catch(() => null);
        }
      }
      await log(supabase, "call remarcada", { contact_id: c.contact_id, nome: c.nome, de: a.inicio, para: horario });
    }
  }
  if (nova) await criarConvite(supabase, cfg, nova).catch(() => false);
  return `Marcado: ${quando} (horário de Brasília) com ${primeiroNomeVendedor(slot.vendedor)}. O convite vai pro e-mail ${email}.`;
}

async function garantirTeo(supabase: SupabaseClient, c: Conversa, atendenteId: string): Promise<void> {
  const r = await unnichat(supabase, "GET", `/contact/${c.contact_id}/assign`);
  const atual = (r.body as { data?: { id?: string; name?: string } | null } | null)?.data ?? null;
  if (r.status !== 200 || atual?.id === atendenteId) return;
  // Quem tem call marcada fica com o vendedor da call (o sistema atribui na
  // marcação): não puxa de volta pro Téo.
  if (atual) {
    const { data: call } = await supabase
      .from("teo_calls")
      .select("id")
      .eq("contact_id", c.contact_id)
      .neq("status", "cancelada")
      .gte("inicio", new Date(Date.now() - 2 * 3600_000).toISOString())
      .limit(1);
    if (call?.length) return;
  }
  await unnichat(supabase, "POST", `/contact/${c.contact_id}/assign`, { attendantId: atendenteId });
  await log(supabase, "reatribuído ao Téo", { contact_id: c.contact_id, nome: c.nome, estava_com: atual?.name ?? null });
}

// ---------- iniciativa, acompanhamento e checagem espaçada ----------

// Acompanhamento de quem parou de responder: horas desde o começo do silêncio
// (mesmo dia, D+1, D+3, D+7, D+21). Depois do último, mais 2 dias e a conversa
// fica "encerrado" (sem_resposta); se a pessoa voltar a escrever, o Téo retoma.
// Se num acompanhamento o Téo responde [ENCERRAR] (a pessoa recusou, pediu pra
// não ser chamada ou já comprou a Black), a conversa também fecha
// (sem_interesse): os modelos das etapas seguintes não saem mais. [SEM_RESPOSTA]
// só pula a etapa (ex.: até aqui só veio resposta automática do WhatsApp).
const FOLLOWUP_HORAS_PADRAO = [3, 24, 72, 168, 504];
const ENCERRAR_DEPOIS_MS = 48 * 3600_000;
// Entre um acompanhamento e o próximo, no mínimo isto (pra quem já estava
// parado há muito tempo não receber várias etapas em sequência).
const INTERVALO_MINIMO_MS = 20 * 3600_000;

// Brasília não tem horário de verão: UTC-3 fixo.
function horaSP(): number {
  return new Date(Date.now() - 3 * 3600_000).getUTCHours();
}

// Chamar alguém por iniciativa (template, acompanhamento) só das 8h às 21h.
// Responder a quem escreveu vale a qualquer hora.
function podeChamar(): boolean {
  const h = horaSP();
  return h >= 8 && h < 21;
}

function proximas8hSP(): Date {
  const dia = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const alvo = new Date(`${dia}T08:00:00-03:00`);
  return alvo.getTime() > Date.now() ? alvo : new Date(alvo.getTime() + 86400_000);
}

// Conversa parada não precisa ser lida a cada minuto: quanto mais tempo sem
// mensagem, mais espaçada a checagem.
function intervaloDeChecagem(ociosoMs: number): number {
  if (ociosoMs < 2 * 3600_000) return 60_000;
  if (ociosoMs < 24 * 3600_000) return 3 * 60_000;
  if (ociosoMs < 72 * 3600_000) return 10 * 60_000;
  return 30 * 60_000;
}

async function adiar(supabase: SupabaseClient, contactId: string, ms: number): Promise<void> {
  await supabase
    .from("teo_conversas")
    .update({ proxima_checagem: new Date(Date.now() + Math.max(ms, 60_000)).toISOString() })
    .eq("contact_id", contactId);
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// O lead parou de responder (a última mensagem é do Téo ou de automação).
// Decide se é hora do próximo acompanhamento. Com a janela de 24h aberta,
// devolve a instrução pro Téo escrever a mensagem; com ela fechada, manda o
// template da etapa aqui mesmo.
async function acompanhar(
  supabase: SupabaseClient,
  c: Conversa,
  cfg: Config,
  telefone: string,
  ultima: MsgUnnichat | undefined,
  janelaAberta: boolean
): Promise<{ status: string; retomar?: string }> {
  const agora = Date.now();
  const ocioso = ultima ? agora - new Date(ultima.date).getTime() : Infinity;

  // Quem tem call marcada espera a call: o lembrete e o vendedor cuidam. Mas é
  // justamente perto da call que a pessoa escreve pra remarcar ou desmarcar:
  // com a call nas próximas 24h, a conversa é lida a cada minuto.
  const { data: call } = await supabase
    .from("teo_calls")
    .select("id, inicio")
    .eq("contact_id", c.contact_id)
    .neq("status", "cancelada")
    .gte("inicio", new Date(agora - 2 * 3600_000).toISOString())
    .order("inicio", { ascending: true })
    .limit(1);
  if (call?.length) {
    const falta = new Date(call[0].inicio as string).getTime() - agora;
    await adiar(supabase, c.contact_id, falta < 24 * 3600_000 ? 60_000 : Math.min(intervaloDeChecagem(ocioso), 10 * 60_000));
    return { status: "call marcada" };
  }

  const horas = cfg.followup_horas?.length ? cfg.followup_horas : FOLLOWUP_HORAS_PADRAO;
  let desde = c.silencio_desde ? new Date(c.silencio_desde).getTime() : NaN;
  if (Number.isNaN(desde)) {
    desde = ultima ? new Date(ultima.date).getTime() : agora;
    await supabase
      .from("teo_conversas")
      .update({ silencio_desde: new Date(desde).toISOString() })
      .eq("contact_id", c.contact_id);
  }
  const etapa = c.followup_etapa ?? 0;
  const ultimoAcomp = c.followup_em ? new Date(c.followup_em).getTime() : null;

  if (etapa >= horas.length) {
    const desdeUltimo = ultimoAcomp ?? desde;
    if (agora - desdeUltimo >= ENCERRAR_DEPOIS_MS) {
      await supabase
        .from("teo_conversas")
        .update({
          estado: "encerrado",
          motivo_humano: "sem_resposta",
          proxima_checagem: new Date(agora + 2 * 3600_000).toISOString(),
          atualizado_em: new Date().toISOString(),
        })
        .eq("contact_id", c.contact_id);
      await log(supabase, "encerrado sem resposta", { contact_id: c.contact_id, nome: c.nome });
      return { status: "encerrado sem resposta" };
    }
    await adiar(supabase, c.contact_id, Math.min(intervaloDeChecagem(ocioso), desdeUltimo + ENCERRAR_DEPOIS_MS - agora));
    return { status: "último acompanhamento enviado" };
  }

  const vence = Math.max(desde + horas[etapa] * 3600_000, ultimoAcomp ? ultimoAcomp + INTERVALO_MINIMO_MS : 0);
  if (agora < vence) {
    await adiar(supabase, c.contact_id, Math.min(intervaloDeChecagem(ocioso), vence - agora));
    return { status: `acompanhamento ${etapa + 1} em ${Math.round((vence - agora) / 60_000)} min` };
  }
  if (!podeChamar()) {
    await adiar(supabase, c.contact_id, proximas8hSP().getTime() - agora);
    return { status: "silêncio (acompanhamento às 8h)" };
  }

  if (janelaAberta) {
    return {
      status: "retomar",
      retomar:
        `[Instrução interna, o lead não vê: o lead não responde desde ${quando(new Date(desde).toISOString())}. ` +
        `Este é o acompanhamento ${etapa + 1} de ${horas.length}. Mande UMA mensagem curta retomando de onde a conversa parou: ` +
        `se você tinha oferecido horários de call, ofereça de novo (pode trocar por outros da lista "Horários livres"), a não ser que você esteja na venda direta (aí retome a venda, não a call); ` +
        `se tinha feito uma pergunta, retome por outro ângulo. Nada de cobrar, de "passando pra saber" nem de repetir a mensagem anterior. ` +
        `Se a pessoa disse claramente que não tem interesse ou pediu pra não ser chamada, responda só [ENCERRAR] (a conversa fecha e não sai mais nenhum acompanhamento). ` +
        `Se só não fizer sentido escrever agora (por exemplo, até aqui só chegou resposta automática do WhatsApp dela), responda só [SEM_RESPOSTA] e esta etapa é pulada.]`,
    };
  }

  // Janela fechada: só template aprovado.
  const tpl = (cfg.followup_templates ?? [])[etapa];
  if (!tpl) {
    await supabase
      .from("teo_conversas")
      .update({ followup_etapa: etapa + 1, followup_em: new Date().toISOString() })
      .eq("contact_id", c.contact_id);
    return { status: `acompanhamento ${etapa + 1} sem template` };
  }
  const r = await unnichat(supabase, "POST", "/meta/templates", {
    phone: telefone,
    templateId: tpl,
    bodyParameters: [{ type: "text", text: primeiroNome(c.nome) }],
  });
  const ok = r.status >= 200 && r.status < 300;
  if (ok) {
    await supabase
      .from("teo_conversas")
      .update({
        followup_etapa: etapa + 1,
        followup_em: new Date().toISOString(),
        proxima_checagem: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("contact_id", c.contact_id);
  } else {
    await adiar(supabase, c.contact_id, 30 * 60_000);
  }
  await log(supabase, ok ? `acompanhamento ${etapa + 1} (template)` : "acompanhamento falhou", {
    contact_id: c.contact_id,
    nome: c.nome,
    template: tpl,
    status: r.status,
  });
  return { status: ok ? `acompanhamento ${etapa + 1} (template)` : "acompanhamento falhou" };
}

// Mensagem digitada por um vendedor no painel do Unnichat: sai sem origem (o
// Téo manda pela API, "unniApi"; automação tem origem própria). Template não
// conta: disparo em massa (ex.: a Black) também sai sem origem. Nota interna
// também não.
const TIPOS_DO_VENDEDOR = new Set(["message", "audio", "image", "document", "video"]);
function ehDoVendedor(m: MsgUnnichat): boolean {
  return m.senderBy === "user" && !m.origin && TIPOS_DO_VENDEDOR.has(m.type);
}

function primeiroNome(nome: string | null): string {
  return (nome ?? "").trim().split(/\s+/)[0] || "tudo bem";
}

async function tratar(supabase: SupabaseClient, c: Conversa, cfg: Config): Promise<string> {
  const pegou = await supabase.rpc("teo_lock", { p_contact: c.contact_id, p_segundos: 180 });
  if (!pegou.data) return "travada";
  try {
    // A fila é lida no começo da rodada. Quando duas rodadas se sobrepõem (às
    // 8h, com muitos acompanhamentos, uma rodada passa de 1 min), a segunda
    // tinha a conversa antiga e mandava o mesmo acompanhamento de novo. Com a
    // trava na mão, relê a conversa e segue com o que está no banco agora.
    const { data: atual } = await supabase
      .from("teo_conversas")
      .select(`${CAMPOS_CONVERSA}, ativo, proxima_checagem`)
      .eq("contact_id", c.contact_id)
      .maybeSingle();
    if (!atual) return "sumiu";
    const fresca = atual as unknown as Conversa & { ativo: boolean; proxima_checagem: string | null };
    if (!fresca.ativo || !["novo", "em_conversa", "encerrado"].includes(fresca.estado)) return "mudou de estado";
    if (fresca.proxima_checagem && new Date(fresca.proxima_checagem).getTime() > Date.now()) return "já tratada";
    c = fresca;
    const msgs: MsgUnnichat[] = await historico(supabase, c.contact_id);
    const reais = msgs.filter((m) => m.senderBy !== "platform");
    const ultima = reais[reais.length - 1];
    const doLead = reais.filter((m) => m.senderBy === "contact");
    const ultimaDoLead = doLead[doLead.length - 1];
    const janelaAberta = Boolean(
      ultimaDoLead && Date.now() - new Date(ultimaDoLead.date).getTime() < JANELA_MS
    );
    // Um vendedor escreveu na conversa depois da última mensagem do Téo: a
    // conversa é dele agora, o Téo sai sem responder por cima.
    const doVendedor = [...reais].reverse().find(ehDoVendedor);
    const ultimaApi = [...reais].reverse().find((m) => m.senderBy === "user" && m.origin === "unniApi");
    // Black: o que o vendedor escreveu antes de o Téo retomar (ele parou de
    // responder) não devolve a conversa pra ele; só o que escrever depois.
    const retomouEm = c.black_retomou_em ? new Date(c.black_retomou_em).getTime() : 0;
    // Primeira rodada depois de o Téo retomar uma conversa da Black (ele ainda
    // não mandou nada desde a retomada).
    const primeiraAposRetomada =
      retomouEm > 0 &&
      !reais.some((m) => m.senderBy === "user" && m.origin === "unniApi" && new Date(m.date).getTime() > retomouEm);
    if (
      doVendedor &&
      Date.now() - new Date(doVendedor.date).getTime() < 48 * 3600_000 &&
      new Date(doVendedor.date).getTime() > retomouEm &&
      (!ultimaApi || new Date(doVendedor.date).getTime() > new Date(ultimaApi.date).getTime())
    ) {
      await supabase
        .from("teo_conversas")
        .update({ estado: "humano", motivo_humano: "vendedor", atualizado_em: new Date().toISOString() })
        .eq("contact_id", c.contact_id);
      await log(supabase, "vendedor assumiu", { contact_id: c.contact_id, nome: c.nome });
      return "vendedor assumiu";
    }
    const telefone = c.telefone;
    if (!telefone) return "sem telefone";

    let abrir = false;
    let retomar: string | undefined;
    let acompanhamento = false;
    const ocioso = ultima ? Date.now() - new Date(ultima.date).getTime() : Infinity;
    // Cupom pedido "à equipe" (pedir_cupom): até cupom_em o Téo está "vendo";
    // depois, a condição está aprovada e ele volta com ela quando fizer sentido.
    const cupom = c.cupom_pendente ?? null;
    const cupomEm = c.cupom_em ? new Date(c.cupom_em).getTime() : 0;
    const cupomEsperando = Boolean(cupom && !cupom.respondida_em) && Date.now() < cupomEm;
    const cupomChegou = Boolean(cupom && !cupom.respondida_em) && !cupomEsperando;
    let cupomAgora = false;
    if (c.estado === "encerrado") {
      // Encerrado por falta de resposta ou porque a pessoa recusou: só volta se
      // ela escrever de novo.
      const voltou = ultima?.senderBy === "contact" && ultima.id !== c.ultima_msg_tratada;
      const retomavel = c.motivo_humano === "sem_resposta" || c.motivo_humano === "sem_interesse";
      if (!retomavel || !voltou) {
        await adiar(supabase, c.contact_id, retomavel ? 2 * 3600_000 : 24 * 3600_000);
        return "encerrado";
      }
    }
    if (c.estado === "novo") {
      if (!janelaAberta) {
        if (c.template_em) return "aguardando resposta do template";
        // Acabou de entrar. Se a automação do Unnichat mandou a boas-vindas
        // (com o "Confirmar"), dá ~10 min pro lead abrir a janela; se não
        // mandou, o Téo abre no primeiro minuto. O minuto de folga cobre a
        // boas-vindas, que sai ~45 s depois que a pessoa entra.
        const boasVindas = reais.some((m) => m.senderBy === "user" && m.origin === "automation");
        if (Date.now() - new Date(c.criado_em).getTime() < (boasVindas ? 10 : 1) * 60_000) {
          return "esperando a janela abrir";
        }
        if (!podeChamar()) {
          await adiar(supabase, c.contact_id, proximas8hSP().getTime() - Date.now());
          return "silêncio (template às 8h)";
        }
        if (!cfg.template_abertura_id) return "sem template";
        const r = await unnichat(supabase, "POST", "/meta/templates", {
          phone: telefone,
          templateId: cfg.template_abertura_id,
          bodyParameters: [{ type: "text", text: primeiroNome(c.nome) }],
        });
        const ok = r.status >= 200 && r.status < 300;
        await supabase
          .from("teo_conversas")
          .update({
            template_em: ok ? new Date().toISOString() : null,
            estado: ok ? "em_conversa" : "novo",
            erro: ok ? null : `template ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`,
            atualizado_em: new Date().toISOString(),
          })
          .eq("contact_id", c.contact_id);
        await log(supabase, ok ? "template enviado" : "template falhou", {
          contact_id: c.contact_id,
          nome: c.nome,
          status: r.status,
        });
        return ok ? "template" : "template falhou";
      }
      // Janela aberta: se o lead acabou de escrever, espera juntar as mensagens.
      if (ultima?.senderBy === "contact" && Date.now() - new Date(ultima.date).getTime() < ESPERA_MS) {
        return "esperando o lead terminar";
      }
      // A automação do Unnichat acabou de mandar a pesquisa (flow): espera até
      // 15 min a pessoa responder, em vez de abrir com as mesmas perguntas por
      // cima. Respondida a pesquisa, a última mensagem passa a ser do lead.
      if (
        ultima?.type === "flow" &&
        ultima.senderBy === "user" &&
        Date.now() - new Date(ultima.date).getTime() < 15 * 60_000
      ) {
        return "esperando a pesquisa";
      }
      abrir = ultima?.senderBy !== "contact";
    } else {
      // O lead escreveu depois da última mensagem do Téo? Conta mesmo que uma
      // automação do Unnichat tenha mandado algo depois (ex.: o lead clica em
      // "Confirmar" e a automação manda a pesquisa por cima).
      // Nota interna (ficha, "📅 Call marcada") não é resposta: se o envio
      // falhou depois da nota (Unnichat 502), o lead continua esperando
      // (Claudia, 11/11: a nota da call fazia o Téo achar que já tinha respondido).
      const ultimaDoTeo = [...reais]
        .reverse()
        .find((m) => m.senderBy === "user" && m.origin !== "automation" && m.type !== "note");
      const pendente =
        Boolean(ultimaDoLead) &&
        ultimaDoLead!.id !== c.ultima_msg_tratada &&
        (!ultimaDoTeo || new Date(ultimaDoLead!.date).getTime() > new Date(ultimaDoTeo.date).getTime());
      // Black: o vendedor não respondeu em 10 min e o Téo ainda não falou
      // desde então — ele responde a dúvida agora.
      const retomaBlack =
        Boolean(c.black_retomou_em) &&
        janelaAberta &&
        !reais.some(
          (m) => m.senderBy === "user" && m.origin === "unniApi" && new Date(m.date).getTime() > new Date(c.black_retomou_em!).getTime()
        );
      if (retomaBlack && !pendente) {
        retomar =
          "O especialista não respondeu a tempo. Responda você, agora, a dúvida que o lead trouxe sobre a Black (está no histórico), com as informações do MODO BLACK FRIDAY.";
      } else if (!pendente && cupomEsperando) {
        await adiar(supabase, c.contact_id, cupomEm - Date.now());
        return "vendo com a equipe (cupom)";
      } else if (!pendente && cupomChegou && janelaAberta && (podeChamar() || ocioso < 30 * 60_000)) {
        // A "equipe" respondeu e o lead não escreveu desde o "vou ver": o Téo
        // volta com a condição, se ainda fizer sentido (não conta como acompanhamento).
        retomar = instrucaoCupom(cupom!);
        cupomAgora = true;
      } else if (!pendente && cupomChegou && janelaAberta) {
        await adiar(supabase, c.contact_id, proximas8hSP().getTime() - Date.now());
        return "cupom fica pras 8h";
      } else if (!pendente) {
        if (ultima?.senderBy === "contact") {
          await adiar(supabase, c.contact_id, intervaloDeChecagem(ocioso));
          return "já tratada";
        }
        // O lead parou de responder: é hora de acompanhar?
        const a = await acompanhar(supabase, c, cfg, telefone, ultima, janelaAberta);
        if (!a.retomar) return a.status;
        retomar = a.retomar;
        acompanhamento = true;
      } else {
        if (
          ultima?.type === "flow" &&
          ultima.senderBy === "user" &&
          Date.now() - new Date(ultima.date).getTime() < 15 * 60_000
        ) {
          return "esperando a pesquisa";
        }
        if (ultima?.senderBy === "contact" && Date.now() - new Date(ultima.date).getTime() < ESPERA_MS) {
          return "esperando o lead terminar";
        }
        if (!janelaAberta) {
          await adiar(supabase, c.contact_id, intervaloDeChecagem(ocioso));
          return "janela fechada";
        }
      }
    }

    const lead = await carregarLead(supabase, c);
    if (!lead.nome) lead.nome = c.nome;
    const doTime = (await vendedorDoLead(supabase, cfg, c.contact_id)) ?? especialistaDaConversa(msgs, cfg);
    // Sem call e sem ninguém do time na conversa: o vendedor que já recebeu o
    // lead numa passagem da Black. A oferta de horário e a próxima passagem vão
    // pra mesma pessoa (senão cada passagem caía num vendedor diferente).
    const daBlack =
      c.black_vendedor && (cfg.vendedores ?? []).some((v) => v.nome === c.black_vendedor) ? c.black_vendedor : null;
    const especialista = doTime ?? daBlack;
    // A automação "Lista de Espera 2.0" tira o atendente e sorteia um vendedor
    // quando o lead clica nos botões dela. Enquanto o Téo responde, a conversa
    // é dele, a não ser que alguém do time já tenha conversado com o lead.
    if (!doTime && cfg.atendente_id) await garantirTeo(supabase, c, cfg.atendente_id);
    // O sorteado do teste continua do Téo mesmo depois de uma passagem da Black
    // (black_vendedor); só sai do teste se tiver call ou conversa com alguém do time.
    // Venda direta do dia (teo_config.venda_direta_ate): todo lead sem especialista
    // é do Téo até o fim do prazo, sem sorteio e sem marcar o lead pra depois.
    const vendaDia =
      blackAtiva(cfg) &&
      !doTime &&
      !especialista &&
      Boolean(cfg.venda_direta_ate) &&
      Date.now() < new Date(cfg.venda_direta_ate ?? 0).getTime();
    const vendaTeo =
      vendaDia ||
      (blackAtiva(cfg) && !doTime && (c.venda_teo === true || !especialista)
        ? await sortearVendaTeo(supabase, cfg, c).catch(() => false)
        : false);
    // Aluno pelo cadastro (tag) ou por compra de curso no e-mail do cadastro ou
    // num e-mail que o lead mandou na conversa (assim o Téo confirma sozinho).
    const alunoPorTag = lead.tags.some((t) => ALUNO_TAG.test(t.trim()));
    const callMarcada = await callMarcadaDoLead(supabase, c.contact_id).catch(() => null);
    // Já comprou a Black? (e-mails do lead ou o telefone do WhatsApp)
    const jaComprouBlack = blackAtiva(cfg)
      ? await acharCompraDaBlack(supabase, emailsDaConversa(lead.email ?? null, msgs), c.telefone).catch(() => null)
      : null;
    const emailsDoLead = blackAtiva(cfg) && !alunoPorTag ? emailsDaConversa(lead.email ?? null, msgs) : [];
    const compraDeCurso = emailsDoLead.length ? await acharCompraDeCurso(supabase, emailsDoLead).catch(() => null) : null;
    // Tem o Max? (Black, Anfitrião 5 Estrelas ou Gigantes: compra, tag ou e-mail)
    const temMax =
      Boolean(jaComprouBlack) ||
      lead.tags.some((t) => MAX_TAG.test(t.trim())) ||
      (compraDeCurso && ehCurso(compraDeCurso.produto) ? MAX_RE.test(compraDeCurso.produto) : false) ||
      (await (async () => {
        const emails = emailsDaConversa(lead.email ?? null, msgs);
        return emails.length ? Boolean(await acharCompraDeCurso(supabase, emails, MAX_RE, NAO_CURSO_RE)) : false;
      })().catch(() => false));
    // Áudios recentes (do lead e do time) viram texto antes de o Téo ler.
    const ouvidos = await ouvirAudios(supabase, msgs).catch(() => 0);
    if (ouvidos) await log(supabase, "áudio ouvido", { contact_id: c.contact_id, nome: c.nome, audios: ouvidos });
    const res = await rodarTeo({
      msgs,
      lead,
      contexto: cfg.contexto,
      precos: cfg.precos ?? "",
      extras: [
        cfg.instrucoes_extras ?? "",
        blackAtiva(cfg)
          ? blocoBlack({
              plantao: plantaoBlack(),
              aluno: alunoPorTag || Boolean(compraDeCurso),
              retomou: Boolean(c.black_retomou_em),
              semEspecialista: !especialista,
              vendaTeo,
              vendaDia,
            })
          : "",
        vendaTeo ? blocoCupons(cfg) : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      avisoDoLead:
        [
          callMarcada ? avisoCallMarcada(callMarcada) : null,
          temMax ? AVISO_MAX : null,
          jaComprouBlack
            ? avisoJaComprouBlack(jaComprouBlack)
            : blackAtiva(cfg) && !compraDeCurso
              ? avisoEmailsSemCompra(emailsDoLead)
              : null,
          !jaComprouBlack && compraDeCurso && !ehCurso(compraDeCurso.produto)
            ? `Black, condição de aluno: confirmada pela compra de "${compraDeCurso.produto}" (quem fez imersão ou foi a um Encontro também é aluno, como o Rômulo explicou na live). Ela ainda não tem o Anfitrião 5 Estrelas: no upgrade, a Black é o jeito de ter o Anfitrião 5 Estrelas, o Gigantes e todo o resto pelo preço de aluno.`
            : null,
          cupom ? avisoCupom(cupom, !cupomEsperando) : null,
        ]
          .filter(Boolean)
          .join("\n\n") || null,
      ficha: c.ficha,
      abrir,
      retomar,
      acompanhamento,
      especialista: especialista ? primeiroNomeVendedor(especialista) : null,
      horariosLivres: (await horariosLivres(supabase, cfg, especialista, c.contact_id)).map(
        (l) => `${l.horario} (com ${primeiroNomeVendedor(l.vendedor)})`
      ),
      marcarCall: (args) => marcarCall(supabase, c, cfg, especialista, args),
      pedirCupom: (args) =>
        pedirCupom(
          supabase,
          c,
          cfg,
          {
            liberado: vendaTeo,
            aluno: alunoPorTag || Boolean(compraDeCurso),
            alunoCurso: alunoPorTag || (compraDeCurso ? ehCurso(compraDeCurso.produto) : false),
            utm: utmDoLead(especialista),
          },
          args
        ),
    });

    // Retomou a conversa da Black e não tem nada a dizer (ex.: o lead só
    // agradeceu depois de pagar), ou só quer passar de volta: devolve em
    // silêncio pro vendedor. Sem isso, a conversa ficava em loop: o Téo
    // pulava o acompanhamento a cada minuto ou passava e retomava a cada 10.
    if (primeiraAposRetomada && res.mensagens.length === 0) {
      const v = (cfg.vendedores ?? []).find((x) => x.nome === c.black_vendedor);
      await supabase
        .from("teo_conversas")
        .update({
          estado: "humano",
          motivo_humano: "vendedor",
          ultima_msg_tratada: ultimaDoLead?.id ?? c.ultima_msg_tratada,
          ficha: [c.ficha, res.ficha].filter(Boolean).join("\n") || null,
          atualizado_em: new Date().toISOString(),
        })
        .eq("contact_id", c.contact_id);
      if (v?.atendente_id) await unnichat(supabase, "POST", `/contact/${c.contact_id}/assign`, { attendantId: v.atendente_id });
      if (res.humano) await anotar(supabase, c.contact_id, `🤖 Téo devolveu pro time — ${res.humano.resumo}`);
      await log(supabase, "black: téo devolveu ao vendedor (nada a responder)", {
        contact_id: c.contact_id,
        nome: c.nome,
        vendedor: c.black_vendedor ?? null,
        humano: res.humano ?? null,
        uso: res.uso ?? null,
      });
      return "devolveu ao vendedor";
    }

    for (const [i, texto] of res.mensagens.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1500));
      await enviarTexto(supabase, telefone, texto);
    }

    const respostas = c.respostas + 1;
    let humano = res.humano;
    if (!humano && respostas >= cfg.max_respostas) {
      humano = { motivo: "limite", resumo: "O Téo chegou no limite de respostas desta conversa." };
    }
    const ficha = [c.ficha, res.ficha].filter(Boolean).join("\n") || null;
    // Acompanhamento com [ENCERRAR]: a pessoa recusou ou pediu pra não ser
    // chamada. Fecha a conversa pra não sair o modelo da próxima etapa.
    const recusou = Boolean(retomar) && !cupomAgora && !humano && res.mensagens.length === 0 && Boolean(res.encerrar);
    // Cupom: a resposta da "equipe" chegou nesta rodada (o Téo usou ou guardou);
    // ainda esperando, a próxima checagem é quando ela chega.
    const cupomAgoraPedido = c.cupom_pendente && !c.cupom_pendente.respondida_em ? c.cupom_pendente : null;
    const cupomRespondido =
      cupomChegou && cupom && cupomAgoraPedido?.pedido_em === cupom.pedido_em
        ? { ...cupom, respondida_em: new Date().toISOString() }
        : null;
    const esperaCupom =
      cupomAgoraPedido && !cupomRespondido && c.cupom_em && new Date(c.cupom_em).getTime() > Date.now() ? c.cupom_em : null;
    await supabase
      .from("teo_conversas")
      .update({
        estado: humano ? "humano" : recusou ? "encerrado" : "em_conversa",
        motivo_humano: humano?.motivo ?? (recusou ? "sem_interesse" : null),
        ultima_msg_tratada: ultimaDoLead?.id ?? c.ultima_msg_tratada,
        ultima_resposta_em: new Date().toISOString(),
        respostas,
        ficha,
        erro: null,
        atualizado_em: new Date().toISOString(),
        proxima_checagem: recusou ? new Date(Date.now() + 2 * 3600_000).toISOString() : esperaCupom,
        ...(cupomRespondido ? { cupom_pendente: cupomRespondido } : {}),
        // Acompanhamento conta a etapa; resposta a quem escreveu zera o silêncio.
        // A volta com o cupom não é acompanhamento: não mexe na contagem.
        ...(cupomAgora
          ? {}
          : retomar
            ? { followup_etapa: (c.followup_etapa ?? 0) + 1, followup_em: new Date().toISOString() }
            : { followup_etapa: 0, silencio_desde: null, followup_em: null }),
      })
      .eq("contact_id", c.contact_id);

    if (humano && blackAtiva(cfg) && plantaoBlack() && humano.motivo !== "suporte") {
      await passarNaBlack(supabase, cfg, c, especialista, humano.resumo, ficha);
    } else if (humano) {
      await anotar(
        supabase,
        c.contact_id,
        `🤖 Téo passou pro time — motivo: ${humano.motivo}\n${humano.resumo}${ficha ? `\n\nFicha:\n${ficha}` : ""}`
      );
    } else if (res.ficha) {
      await anotar(supabase, c.contact_id, `🤖 Ficha do Téo: ${res.ficha}`);
    }
    const nota = humano
      ? "passou pro time"
      : abrir
        ? "abriu conversa"
        : cupomAgora
          ? res.mensagens.length
            ? "voltou com o cupom"
            : "cupom guardado (conversa mudou)"
          : retomar
          ? res.mensagens.length
            ? `acompanhamento ${(c.followup_etapa ?? 0) + 1} (texto)`
            : recusou
              ? `acompanhamento ${(c.followup_etapa ?? 0) + 1} pulado (encerrado: sem interesse)`
              : `acompanhamento ${(c.followup_etapa ?? 0) + 1} pulado`
          : "respondeu";
    await log(supabase, nota, {
      contact_id: c.contact_id,
      nome: c.nome,
      recebida: ultimaDoLead?.message ?? null,
      enviadas: res.mensagens,
      humano,
      uso: res.uso ?? null,
    });
    return humano ? `humano (${humano.motivo})` : nota;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("teo_conversas")
      .update({ erro: msg.slice(0, 500), atualizado_em: new Date().toISOString() })
      .eq("contact_id", c.contact_id);
    await log(supabase, "erro", { contact_id: c.contact_id, nome: c.nome, erro: msg.slice(0, 500) });
    return "erro";
  } finally {
    await supabase.rpc("teo_unlock", { p_contact: c.contact_id });
  }
}

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Aviso da call pro lead: texto livre com a janela de 24h aberta; fechada, o
// template de utilidade "lembrete_call" ({{1}} nome, {{2}} vendedor, {{3}}
// quando). Sem template configurado, não manda nada.
async function avisarDaCall(
  supabase: SupabaseClient,
  cfg: Config,
  telefone: string,
  aberta: boolean,
  texto: string,
  params: [string, string, string]
): Promise<"texto" | "template" | "sem janela"> {
  if (aberta) {
    await enviarTexto(supabase, telefone, texto);
    return "texto";
  }
  if (!cfg.template_lembrete_id) return "sem janela";
  const r = await unnichat(supabase, "POST", "/meta/templates", {
    phone: telefone,
    templateId: cfg.template_lembrete_id,
    bodyParameters: params.map((text) => ({ type: "text", text })),
  });
  return r.status >= 200 && r.status < 300 ? "template" : "sem janela";
}

// Antes de cada call:
// * véspera, das 18h às 21h: "amanhã às 15h com o Flávio, tá de pé?" (se a
//   pessoa responder, a janela de 24h reabre pro lembrete do dia);
// * ~90 min antes: lembrete com o link;
// * 10 min antes: a conversa passa pro vendedor no Unnichat, com a ficha;
// * 3 min depois do horário: "Flávio já está na sala te esperando" (sem artigo: serve pra vendedora), com o
//   link, a menos que o lead tenha escrito perto da hora.
// Com a janela fechada, os avisos saem pelo template "lembrete_call". O
// follow-up pós-call é do vendedor.
async function cuidarDasCalls(supabase: SupabaseClient, cfg: Config): Promise<string[]> {
  const feitos: string[] = [];
  const agora = Date.now();
  const { data: calls } = await supabase
    .from("teo_calls")
    .select("id, contact_id, nome, inicio, vendedor, meet_url, lembrete_em, passou_vendedor_em, vespera_em, esperando_em, resumo, email, status, evento_id, reuniao_id")
    .in("status", ["marcada", "convite_enviado"])
    .gte("inicio", new Date(agora - 2 * 3600_000).toISOString());
  for (const k of calls ?? []) {
    const t = new Date(k.inicio).getTime();
    if (k.status === "marcada" && t > agora) {
      const ok = await criarConvite(supabase, cfg, k).catch(() => false);
      if (ok) {
        feitos.push(`convite ${k.nome}`);
        continue; // o lembrete pega o link na próxima rodada
      }
    }
    // Gravação automática: liga uma vez por reunião, até 26h antes (e até 5
    // min depois do início). O log guarda o link, então convite reemitido
    // (link novo) liga de novo. A nota leva "(pt-BR)" desde que o idioma passou
    // a ir junto, pra que as reuniões ligadas antes recebam o idioma uma vez.
    if (k.meet_url && t > agora - 5 * 60_000 && t < agora + 26 * 3600_000) {
      const { data: feito } = await supabase
        .from("webhook_log")
        .select("id")
        .eq("source", "teo")
        .eq("note", MARCA_GRAVACAO)
        .eq("body->>meet_url", k.meet_url)
        .limit(1);
      if (!feito?.length) {
        const r = await ligarGravacao(supabase, cfg, k).catch((e) => (e instanceof Error ? e.message : String(e)));
        if (r === "ok") {
          await log(supabase, MARCA_GRAVACAO, { call_id: k.id, nome: k.nome, meet_url: k.meet_url });
        } else if (r !== "sem teams") {
          const { count } = await supabase
            .from("webhook_log")
            .select("id", { count: "exact", head: true })
            .eq("source", "teo")
            .eq("note", "gravação automática falhou")
            .eq("body->>meet_url", k.meet_url);
          // Tenta de novo nas rodadas seguintes, mas registra só as 3 primeiras falhas.
          if ((count ?? 0) < 3) await log(supabase, "gravação automática falhou", { call_id: k.id, nome: k.nome, meet_url: k.meet_url, erro: r });
        }
      }
    }
    const { data: conv } = await supabase
      .from("teo_conversas")
      .select("telefone, nome, ficha")
      .eq("contact_id", k.contact_id)
      .maybeSingle();
    const hora = local(k.inicio).slice(11, 16);
    const vend = k.vendedor ? primeiroNomeVendedor(k.vendedor) : "o especialista";
    const nome = primeiroNome(k.nome ?? conv?.nome ?? null);
    const horaFala = hora.endsWith(":00") ? `${Number(hora.slice(0, 2))}h` : hora.replace(":", "h");
    // Lido uma vez por rodada e só quando algum aviso está pra sair.
    let msgsCache: MsgUnnichat[] | null = null;
    const msgs = async () => (msgsCache ??= await historico(supabase, k.contact_id));
    const janela = async () => {
      const doLead = (await msgs()).filter((m) => m.senderBy === "contact");
      const ult = doLead[doLead.length - 1];
      return Boolean(ult && agora - new Date(ult.date).getTime() < JANELA_MS);
    };
    try {
      // Véspera: a call é amanhã (horário de Brasília) e são 18h–21h. Se a
      // conversa teve mensagem nas últimas 3h (acabou de marcar ou de falar),
      // não precisa: só registra.
      const diaCall = local(k.inicio).slice(0, 10);
      const amanha = local(new Date(agora + 86400_000).toISOString()).slice(0, 10);
      const h = horaSP();
      if (!k.vespera_em && conv?.telefone && diaCall === amanha && h >= 18 && h < 21) {
        const reais = (await msgs()).filter((m) => m.senderBy !== "platform");
        const ultima = reais[reais.length - 1];
        const recente = ultima && agora - new Date(ultima.date).getTime() < 3 * 3600_000;
        const dia = DIAS_SEMANA[new Date(`${diaCall}T12:00:00-03:00`).getUTCDay()];
        const r = recente
          ? "recente"
          : await avisarDaCall(
              supabase,
              cfg,
              conv.telefone,
              await janela(),
              `Oi, ${nome}! Amanhã (${dia}) às ${horaFala} é o seu papo de 20 min com ${vend}. Tá de pé?`,
              [nome, vend, `amanhã (${dia}) às ${horaFala}`]
            );
        await supabase.from("teo_calls").update({ vespera_em: new Date().toISOString() }).eq("id", k.id);
        await log(supabase, `véspera ${r}`, { contact_id: k.contact_id, nome: k.nome, hora });
        if (r !== "recente") feitos.push(`véspera ${k.nome}`);
      }
      if (!k.lembrete_em && k.meet_url && conv?.telefone && agora >= t - 90 * 60_000 && agora < t - 5 * 60_000) {
        const r = await avisarDaCall(
          supabase,
          cfg,
          conv.telefone,
          await janela(),
          `Oi, ${nome}! Passando pra lembrar: hoje às ${hora} é o seu papo de 20 min com ${vend}. É só entrar por este link na hora: ${k.meet_url}\n\n${APP_TEAMS}`,
          [nome, vend, `hoje às ${horaFala}`]
        );
        await supabase.from("teo_calls").update({ lembrete_em: new Date().toISOString() }).eq("id", k.id);
        await log(supabase, r === "sem janela" ? "lembrete sem janela" : `lembrete enviado (${r})`, {
          contact_id: k.contact_id,
          nome: k.nome,
          hora,
        });
        feitos.push(`lembrete ${k.nome}`);
      }
      // 3 min depois do horário (até 15 min): "já está na sala te esperando".
      // Se o lead escreveu desde 10 min antes da call, ele está por perto e o
      // vendedor já está falando com ele: não manda.
      if (!k.esperando_em && k.meet_url && conv?.telefone && agora >= t + 3 * 60_000 && agora < t + 15 * 60_000) {
        const escreveu = (await msgs()).some(
          (m) => m.senderBy === "contact" && new Date(m.date).getTime() >= t - 10 * 60_000
        );
        // O vendedor falou com o lead nas 3h antes da call (remarcou, mandou
        // outro link, combinou outra coisa): ele está cuidando, não manda.
        // Em 13/11 o Breno tinha remarcado a Gabriela e o Téo mandou mesmo assim.
        const vendedorFalou = (await msgs()).some(
          (m) => ehDoVendedor(m) && new Date(m.date).getTime() >= t - 3 * 3600_000
        );
        const r = escreveu
          ? "lead por perto"
          : vendedorFalou
            ? "vendedor falou com o lead"
            : await avisarDaCall(
                supabase,
                cfg,
                conv.telefone,
                await janela(),
                `Oi, ${nome}! Chegou a hora do seu papo com ${vend}. Se ainda não entrou, é por este link: ${k.meet_url}\n\n${APP_TEAMS}`,
                [nome, vend, `começou agora`]
              );
        await supabase.from("teo_calls").update({ esperando_em: new Date().toISOString() }).eq("id", k.id);
        await log(supabase, `te esperando ${r}`, { contact_id: k.contact_id, nome: k.nome, hora });
        if (r !== "lead por perto" && r !== "vendedor falou com o lead") feitos.push(`te esperando ${k.nome}`);
      }
      if (!k.passou_vendedor_em && agora >= t - 10 * 60_000) {
        const v = (cfg.vendedores ?? []).find((x) => x.nome === k.vendedor);
        if (v) await unnichat(supabase, "POST", `/contact/${k.contact_id}/assign`, { attendantId: v.atendente_id });
        await anotar(
          supabase,
          k.contact_id,
          `📞 Call agora às ${hora} com ${k.vendedor ?? "o especialista"} (marcada pelo Téo). 🎥 Ao entrar na sala do Teams, confira se está gravando; se não estiver, clique em Gravar e transcrever. 📝 Se a call não for pela sala do Teams, deixe aqui uma nota começando com #call e o que rolou (ou #faltou, se o lead não apareceu): sem gravação e sem essa nota, a call conta como falta no Painel Calls. Depois da call, o follow-up é seu: proposta e link logo em seguida.\n${k.resumo ?? ""}${conv?.ficha ? `\n\nFicha:\n${conv.ficha}` : ""}`
        );
        await supabase
          .from("teo_conversas")
          .update({ estado: "humano", motivo_humano: "call", atualizado_em: new Date().toISOString() })
          .eq("contact_id", k.contact_id);
        await supabase.from("teo_calls").update({ passou_vendedor_em: new Date().toISOString() }).eq("id", k.id);
        await log(supabase, "passou pro vendedor", { contact_id: k.contact_id, nome: k.nome, vendedor: k.vendedor, hora });
        feitos.push(`vendedor ${k.nome}`);
      }
      // Passou pro vendedor, mas o lead escreveu perto da hora (pedindo pra
      // remarcar, sem conseguir entrar…) e o vendedor não respondeu em 5 min:
      // o Téo retoma a conversa em vez de deixar o lead sem resposta. Só até
      // 15 min depois do horário; dali em diante a conversa é do vendedor.
      if (k.passou_vendedor_em && agora < t + 15 * 60_000) {
        const desde = new Date(k.passou_vendedor_em).getTime();
        const depois = (await msgs()).filter((m) => new Date(m.date).getTime() > desde);
        const doLead = depois.filter((m) => m.senderBy === "contact");
        const ultLead = doLead[doLead.length - 1];
        // "Não consigo entrar" (link, app, sala) não espera os 5 min: o Téo
        // responde na hora com o link e o passo a passo, e avisa o vendedor.
        const naoEntra = Boolean(ultLead && NAO_CONSIGO_ENTRAR_RE.test(ultLead.message ?? ""));
        const espera = naoEntra ? 0 : 5 * 60_000;
        if (ultLead && !depois.some(ehDoVendedor) && agora - new Date(ultLead.date).getTime() >= espera) {
          const { data: retomou } = await supabase
            .from("teo_conversas")
            .update({ estado: "em_conversa", motivo_humano: null, proxima_checagem: null, atualizado_em: new Date().toISOString() })
            .eq("contact_id", k.contact_id)
            .eq("estado", "humano")
            .eq("motivo_humano", "call")
            .select("contact_id");
          if (retomou?.length) {
            if (naoEntra && k.meet_url) {
              await anotar(
                supabase,
                k.contact_id,
                `⚠️ ${nome} disse que não consegue entrar na call. O Téo mandou o link da sala e o passo a passo (app no celular, navegador no computador). ${vend}: entre por ESTE link, que é o mesmo do lead: ${k.meet_url}`
              );
            }
            await log(supabase, naoEntra ? "téo retomou antes da call (não consegue entrar)" : "téo retomou antes da call", {
              contact_id: k.contact_id,
              nome: k.nome,
              hora,
            });
            feitos.push(`retomou ${k.nome}`);
          }
        }
      }
    } catch (e) {
      await log(supabase, "erro na call", { contact_id: k.contact_id, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return feitos;
}

// Black: passa a conversa pro vendedor do lead (ou pro que recebeu menos
// conversas da Black hoje), atribui no Unnichat e deixa a nota. Se ele não
// digitar nada em 10 min, cuidarDaBlack devolve pro Téo.
async function passarNaBlack(
  supabase: SupabaseClient,
  cfg: Config,
  c: Conversa,
  especialista: string | null,
  resumo: string,
  ficha: string | null
): Promise<void> {
  const time = cfg.vendedores ?? [];
  let v = time.find((x) => x.nome === especialista) ?? null;
  if (!v && time.length) {
    const hojeSP = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const { data: hoje } = await supabase
      .from("teo_conversas")
      .select("black_vendedor")
      .gte("black_passou_em", `${hojeSP}T03:00:00Z`);
    const carga = new Map<string, number>();
    for (const r of hoje ?? []) if (r.black_vendedor) carga.set(r.black_vendedor, (carga.get(r.black_vendedor) ?? 0) + 1);
    v = [...time].sort((a, b) => (carga.get(a.nome) ?? 0) - (carga.get(b.nome) ?? 0))[0];
  }
  if (v?.atendente_id) await unnichat(supabase, "POST", `/contact/${c.contact_id}/assign`, { attendantId: v.atendente_id });
  await anotar(
    supabase,
    c.contact_id,
    `🔥 BLACK — ${v ? primeiroNomeVendedor(v.nome) : "time"}, responda agora por aqui. Se você não responder em 10 min (agora ou sempre que o lead escrever de novo), o Téo assume e segue a venda.\nDúvida: ${resumo}${ficha ? `\n\nFicha:\n${ficha}` : ""}`
  );
  await supabase
    .from("teo_conversas")
    .update({ black_passou_em: new Date().toISOString(), black_vendedor: v?.nome ?? null, black_retomou_em: null })
    .eq("contact_id", c.contact_id);
  await log(supabase, "black: passou pro vendedor", { contact_id: c.contact_id, nome: c.nome, vendedor: v?.nome ?? null, resumo });
}

// Black: conversa passada pro vendedor há 10 min sem nenhuma mensagem digitada
// por ele volta pro Téo, que responde a dúvida.
async function cuidarDaBlack(supabase: SupabaseClient, cfg: Config): Promise<string[]> {
  if (!blackAtiva(cfg)) return [];
  const feitos: string[] = [];
  // Quem pediu especialista fora do plantão (madrugada) ficou só com a nota:
  // quando o plantão abre, vai pro vendedor como uma passagem normal da Black
  // (com os 10 min de espera).
  if (plantaoBlack()) {
    const { data: noturnos } = await supabase
      .from("teo_conversas")
      .select("contact_id, nome, ficha, black_vendedor")
      .eq("estado", "humano")
      .eq("ativo", true)
      .in("motivo_humano", ["black", "pediu_humano", "preco", "comprar"])
      .is("black_passou_em", null)
      .gte("atualizado_em", new Date(Date.now() - 16 * 3600_000).toISOString());
    for (const n of noturnos ?? []) {
      const { data: ult } = await supabase
        .from("webhook_log")
        .select("body, created_at")
        .eq("source", "teo")
        .eq("note", "passou pro time")
        .eq("body->>contact_id", n.contact_id)
        .gte("created_at", new Date(Date.now() - 16 * 3600_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Só quem passou fora do plantão (23h–9h); de dia já passou na hora.
      const quando = ult?.created_at ? new Date(new Date(ult.created_at).getTime() - 3 * 3600_000).getUTCHours() : null;
      if (quando === null || (quando >= 9 && quando < 23)) continue;
      const resumo =
        ((ult?.body as { humano?: { resumo?: string } } | null)?.humano?.resumo ?? "") ||
        "Pediu um especialista fora do plantão. Leia a conversa.";
      // Mesmo critério da passagem de dia: o vendedor da primeira call ou,
      // sem call, quem do time já conversou com o lead (senão o aluno de um
      // vendedor caía no rodízio e ia pra outro); por último, quem já recebeu
      // o lead numa passagem da Black (passarNaBlack confere se está no time).
      const especialista =
        (await vendedorDoLead(supabase, cfg, n.contact_id)) ??
        especialistaDaConversa(await historico(supabase, n.contact_id).catch(() => []), cfg) ??
        ((n.black_vendedor as string | null) ?? null);
      await passarNaBlack(
        supabase,
        cfg,
        { contact_id: n.contact_id, nome: n.nome } as Conversa,
        especialista,
        `(da madrugada) ${resumo}`,
        (n.ficha as string | null) ?? null
      );
      feitos.push(`black noturno ${n.nome}`);
    }
  }
  const { data: paradas } = await supabase
    .from("teo_conversas")
    .select("contact_id, nome, black_passou_em, black_vendedor")
    .eq("estado", "humano")
    .eq("ativo", true)
    .is("black_retomou_em", null)
    .neq("motivo_humano", "vendedor")
    .not("black_passou_em", "is", null)
    .lte("black_passou_em", new Date(Date.now() - ESPERA_BLACK_MS).toISOString())
    .gte("black_passou_em", new Date(Date.now() - 6 * 3600_000).toISOString());
  for (const p of paradas ?? []) {
    const desde = new Date(p.black_passou_em as string).getTime();
    const msgs = await historico(supabase, p.contact_id).catch(() => null);
    if (!msgs) continue;
    if (msgs.some((m) => ehDoVendedor(m) && new Date(m.date).getTime() > desde)) {
      // O vendedor respondeu: a conversa é dele; não volta mais pro Téo nem é
      // passada de novo (black_passou_em fica, motivo vira "vendedor").
      await supabase.from("teo_conversas").update({ motivo_humano: "vendedor" }).eq("contact_id", p.contact_id);
      continue;
    }
    // O Téo já retomou desde a última mensagem do lead e passou de novo (algo
    // que só o time faz, ex.: gerar o link de renovação): não retoma outra vez.
    // Sem isso o lead recebia a mesma resposta a cada 10 min (Fernando Luiz,
    // 11/11). Se o lead escrever de novo, a retomada volta a valer.
    const ultimaDoLead = Math.max(
      0,
      ...msgs.filter((m) => m.senderBy === "contact").map((m) => new Date(m.date).getTime())
    );
    const { count: jaRetomou } = await supabase
      .from("webhook_log")
      .select("id", { count: "exact", head: true })
      .eq("source", "teo")
      .like("note", "black: téo retomou%")
      .eq("body->>contact_id", p.contact_id)
      .gt("created_at", new Date(ultimaDoLead).toISOString());
    if (jaRetomou) {
      await supabase
        .from("teo_conversas")
        .update({ motivo_humano: "vendedor", atualizado_em: new Date().toISOString() })
        .eq("contact_id", p.contact_id);
      await log(supabase, "black: não retomou de novo (lead não escreveu desde a última retomada)", {
        contact_id: p.contact_id,
        nome: p.nome,
        vendedor: p.black_vendedor,
      });
      continue;
    }
    await supabase
      .from("teo_conversas")
      .update({
        estado: "em_conversa",
        motivo_humano: null,
        black_retomou_em: new Date().toISOString(),
        proxima_checagem: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("contact_id", p.contact_id);
    if (cfg.atendente_id) await unnichat(supabase, "POST", `/contact/${p.contact_id}/assign`, { attendantId: cfg.atendente_id });
    await log(supabase, "black: téo retomou (vendedor não respondeu em 10 min)", { contact_id: p.contact_id, nome: p.nome, vendedor: p.black_vendedor });
    feitos.push(`black retomou ${p.nome}`);
  }
  feitos.push(...(await retomarVendedorParado(supabase, cfg)));
  return feitos;
}

// Black: o vendedor já tinha respondido (a conversa ficou com ele, motivo
// "vendedor"), mas o lead escreveu de novo e ninguém respondeu em 10 min. O
// Téo assume e segue a venda. Só olha quem escreveu nas últimas 6h (pelos
// eventos do webhook), pra não ler o histórico de todo mundo a cada minuto, e
// não entra em conversa com call acontecendo.
async function retomarVendedorParado(supabase: SupabaseClient, cfg: Config): Promise<string[]> {
  const agora = Date.now();
  const { data: eventos } = await supabase
    .from("webhook_log")
    .select("contato:body->contact->>id")
    .eq("source", "unnichat")
    .gte("created_at", new Date(agora - 6 * 3600_000).toISOString())
    .lte("created_at", new Date(agora - ESPERA_BLACK_MS).toISOString())
    .limit(3000);
  const ids = [
    ...new Set(((eventos ?? []) as { contato: string | null }[]).map((e) => e.contato).filter((x): x is string => Boolean(x))),
  ];
  if (!ids.length) return [];
  const { data: comVendedor } = await supabase
    .from("teo_conversas")
    .select("contact_id, nome, black_vendedor, black_retomou_em")
    .eq("estado", "humano")
    .eq("ativo", true)
    .eq("motivo_humano", "vendedor")
    .not("black_passou_em", "is", null)
    .in("contact_id", ids.slice(0, 500));
  const feitos: string[] = [];
  for (const p of comVendedor ?? []) {
    const { count: emCall } = await supabase
      .from("teo_calls")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", p.contact_id)
      .neq("status", "cancelada")
      .gte("inicio", new Date(agora - 90 * 60_000).toISOString())
      .lte("inicio", new Date(agora + 20 * 60_000).toISOString());
    if (emCall) continue;
    const msgs = await historico(supabase, p.contact_id).catch(() => null);
    if (!msgs) continue;
    const ultimaDoLead = [...msgs].reverse().find((m) => m.senderBy === "contact");
    if (!ultimaDoLead) continue;
    const t = new Date(ultimaDoLead.date).getTime();
    if (agora - t < ESPERA_BLACK_MS || agora - t > 6 * 3600_000) continue;
    // Já retomou por esta mensagem (e devolveu): só volta se o lead escrever de novo.
    if (p.black_retomou_em && new Date(p.black_retomou_em as string).getTime() >= t) continue;
    const respondida = msgs.some(
      (m) =>
        new Date(m.date).getTime() > t &&
        (ehDoVendedor(m) || (m.senderBy === "user" && m.origin === "unniApi" && TIPOS_DO_VENDEDOR.has(m.type)))
    );
    if (respondida) continue;
    const { data: pegou } = await supabase
      .from("teo_conversas")
      .update({
        estado: "em_conversa",
        motivo_humano: null,
        black_retomou_em: new Date().toISOString(),
        proxima_checagem: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("contact_id", p.contact_id)
      .eq("estado", "humano")
      .eq("motivo_humano", "vendedor")
      .select("contact_id");
    if (!pegou?.length) continue;
    if (cfg.atendente_id) await unnichat(supabase, "POST", `/contact/${p.contact_id}/assign`, { attendantId: cfg.atendente_id });
    await log(supabase, "black: téo retomou (vendedor parou de responder)", {
      contact_id: p.contact_id,
      nome: p.nome,
      vendedor: p.black_vendedor,
      lead_escreveu_em: ultimaDoLead.date,
    });
    feitos.push(`black retomou (vendedor parado) ${p.nome}`);
  }
  return feitos;
}

async function rodar() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Sem ANTHROPIC_API_KEY." }, { status: 501 });

  const { data: cfg } = await supabase.from("teo_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg?.ligado) return NextResponse.json({ ok: true, ligado: false });

  const inicio = Date.now();
  const calls = await cuidarDasCalls(supabase, cfg as Config);
  const black = await cuidarDaBlack(supabase, cfg as Config).catch(() => [] as string[]);
  const inscritos = await autoInscrever(supabase, cfg as Config);
  const tags = await marcarTag(supabase, cfg as Config);

  const campos = CAMPOS_CONVERSA;
  // Só as conversas cuja próxima checagem já chegou (as paradas são lidas
  // de forma espaçada). Se o filtro falhar, lê todas, como antes.
  const consulta = await supabase
    .from("teo_conversas")
    .select(campos)
    .eq("ativo", true)
    .in("estado", ["novo", "em_conversa", "encerrado"])
    .or(`proxima_checagem.is.null,proxima_checagem.lte.${new Date().toISOString()}`)
    .order("proxima_checagem", { ascending: true, nullsFirst: true });
  let conversas = consulta.data;
  if (consulta.error) {
    await log(supabase, "erro", { erro: `fila: ${consulta.error.message}` });
    conversas = (
      await supabase.from("teo_conversas").select(campos).eq("ativo", true).in("estado", ["novo", "em_conversa"])
    ).data;
  }
  const fila = [...((conversas ?? []) as Conversa[])];
  const resultado: Record<string, string> = {};

  async function pista() {
    while (fila.length > 0 && Date.now() - inicio < ORCAMENTO_MS) {
      const c = fila.shift()!;
      resultado[c.nome ?? c.contact_id] = await tratar(supabase!, c, cfg as Config);
    }
  }
  await Promise.all(Array.from({ length: PARALELO }, () => pista()));

  return NextResponse.json({ ok: true, calls, black, inscritos, tags, resultado, ms: Date.now() - inicio });
}

// GET: cron da Vercel (vercel.json). POST: disparo manual, já logado.
// A autorização fica no proxy (src/proxy.ts) para todo /api/sync.
export async function GET() {
  return rodar();
}

export async function POST() {
  return rodar();
}
