import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  anotar,
  enviarTexto,
  historico,
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
}

interface Config {
  ligado: boolean;
  horarios: string[] | null;
  vendedores: { nome: string; email: string; atendente_id: string; sala?: string | null }[] | null;
  auto_inscrever_ate: string | null;
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
    return tags.includes("lista-de-espera") && !tags.some((t: string) => t.includes("black-2026"));
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
// últimos 30 dias). Se tem alguém, a call é com essa pessoa. A API não diz
// quem mandou cada mensagem: vale quem estava com a conversa naquela hora,
// pelos avisos "Conversa atribuída … ao Fulano" (o Unnichat também atribui a
// quem manda mensagem numa conversa sem dono).
function especialistaDaConversa(msgs: MsgUnnichat[], cfg: Config): string | null {
  const vendedores = (cfg.vendedores ?? []).map((v) => v.nome);
  const desde = Date.now() - 30 * 86400_000;
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

// Conversão de cada vendedor nos últimos 90 dias: vendas pagas ÷ leads
// atribuídos (a conta de "leads por venda" do painel, invertida). 90 dias pra
// um mês ruim (ou um mês com poucos leads novos, como outubro de 2026) não
// virar a ordem. Contagem no banco (head + count): 90 dias de leads passam do
// limite de 1.000 linhas por consulta. Quem não tem dado fica com a média do
// time.
const JANELA_CONVERSAO_DIAS = 90;

async function taxasDeConversao(
  supabase: SupabaseClient,
  nomes: string[]
): Promise<Map<string, number>> {
  const desde = new Date(Date.now() - JANELA_CONVERSAO_DIAS * 86400_000).toISOString().slice(0, 10);
  const { data: sellers } = await supabase.from("sellers").select("id, name").in("name", nomes);
  const brutas = new Map<string, number | null>(
    await Promise.all(
      nomes.map(async (nome): Promise<[string, number | null]> => {
        const id = (sellers ?? []).find((s) => s.name === nome)?.id;
        if (!id) return [nome, null];
        const [v, l] = await Promise.all([
          supabase
            .from("sales")
            .select("id", { count: "exact", head: true })
            .eq("seller_id", id)
            .eq("status", "paga")
            .gte("sale_date", desde),
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("seller_id", id).gte("created_at", desde),
        ]);
        return [nome, v.count != null && l.count ? v.count / l.count : null];
      })
    )
  );
  const conhecidas = [...brutas.values()].filter((t): t is number => t !== null);
  const media = conhecidas.length ? conhecidas.reduce((a, b) => a + b, 0) / conhecidas.length : 1;
  // Piso pequeno: quem não vendeu nada no período ainda pega call quando os
  // outros estão ocupados, e a conta da distribuição não divide por zero.
  return new Map(nomes.map((n) => [n, Math.max(brutas.get(n) ?? media, 0.001)]));
}

// Quem pega a próxima call do dia: as calls do dia são divididas na proporção
// da conversão. Vai quem tem a menor (calls no dia + 1) ÷ conversão; empate
// fica com quem converte mais. Ex.: conversões 8,0%, 6,5% e 4,6% num dia de 5
// calls dão 2, 2 e 1.
function ordemDoDia(livres: string[], cargaNoDia: (v: string) => number, taxa: Map<string, number>): string[] {
  const t = (v: string) => taxa.get(v) ?? 0.001;
  return [...livres].sort((a, b) => (cargaNoDia(a) + 1) / t(a) - (cargaNoDia(b) + 1) / t(b) || t(b) - t(a));
}

// Horários da config daqui a 1h+ em que algum vendedor está livre. Os três
// atendem em paralelo (cada um no seu computador): o mesmo horário aceita uma
// call por vendedor. Em cada horário vai o vendedor livre que ordemDoDia()
// escolhe. Se alguém do time já conversou com o lead, só os horários dessa
// pessoa.
async function horariosLivres(
  supabase: SupabaseClient,
  cfg: Config,
  especialista: string | null = null
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
      .select("inicio, vendedor")
      .neq("status", "cancelada")
      .gte("inicio", new Date(Date.now() - 12 * 3600_000).toISOString()),
    taxasDeConversao(supabase, time),
  ]);
  const ocupado = new Set((marcadas ?? []).map((m) => `${new Date(m.inicio).getTime()}|${m.vendedor}`));
  const dia = (iso: string) => local(iso).slice(0, 10);
  const carga = new Map<string, number>();
  for (const m of marcadas ?? []) {
    if (m.vendedor) carga.set(`${dia(m.inicio)}|${m.vendedor}`, (carga.get(`${dia(m.inicio)}|${m.vendedor}`) ?? 0) + 1);
  }
  const out: { horario: string; vendedor: string }[] = [];
  for (const h of todos) {
    const ts = new Date(h).getTime();
    const livres = vendedores.filter((v) => !ocupado.has(`${ts}|${v}`));
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
};

// Reunião do Teams pela Microsoft Graph, na agenda do organizador
// ("Canal do Anfitrião"), com o lead e o vendedor convidados. A Graph manda o
// convite por e-mail a cada um. Devolve null se o Teams não está configurado.
// Acesso à agenda do organizador (anfitriao@) pela Graph: token do app e a URL
// dos eventos. null quando o Teams/Graph não está configurado.
async function graph(
  supabase: SupabaseClient,
  cfg: Config
): Promise<{ ok: true; base: string; auth: Record<string, string> } | { ok: false; erro: string } | null> {
  if (!cfg.teams_tenant_id || !cfg.teams_client_id || !cfg.teams_organizador) return null;
  const { data: segredo } = await supabase.rpc("teo_teams_segredo");
  if (!segredo) return null;
  const tok = await fetch(`https://login.microsoftonline.com/${cfg.teams_tenant_id}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.teams_client_id,
      client_secret: String(segredo),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const t = (await tok.json().catch(() => null)) as { access_token?: string; error_description?: string } | null;
  if (!t?.access_token) return { ok: false, erro: `token ${tok.status}: ${(t?.error_description ?? "").slice(0, 200)}` };
  return {
    ok: true,
    base: `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.teams_organizador)}/events`,
    auth: { Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json" },
  };
}

// Convite com a sala fixa do vendedor (link de uma sala que ele mesmo hospeda):
// evento na agenda do organizador, sem reunião online, com o link no local e
// na descrição. A Graph manda o convite pros convidados.
async function criarComSala(
  supabase: SupabaseClient,
  cfg: Config,
  k: CallConvite,
  dados: { titulo: string; descricao: string; inicio: string; fim: string; convidados: string[]; sala: string }
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
      transactionId: `${k.id}-sala`,
    }),
  });
  const ev = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!res.ok || !ev?.id) return { ok: false, erro: `evento ${res.status}: ${(ev?.error?.message ?? "").slice(0, 200)}` };
  return { ok: true, id: ev.id };
}

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
  const livres = await horariosLivres(supabase, cfg, especialista);
  const horario = args.horario.trim().slice(0, 16);
  const slot = livres.find((l) => l.horario === horario);
  const lista = (ls: typeof livres) =>
    ls.slice(0, 8).map((l) => `${l.horario} (com ${primeiroNomeVendedor(l.vendedor)})`).join(", ") || "nenhum";
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
      ? `Esse horário acabou de ser ocupado. Livres agora: ${lista(await horariosLivres(supabase, cfg, especialista))}.`
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
        `se você tinha oferecido horários de call, ofereça de novo (pode trocar por outros da lista "Horários livres"); ` +
        `se tinha feito uma pergunta, retome por outro ângulo. Nada de cobrar, de "passando pra saber" nem de repetir a mensagem anterior. ` +
        `Se a pessoa disse claramente que não tem interesse ou pediu pra não ser chamada, responda só [SEM_RESPOSTA].]`,
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

function primeiroNome(nome: string | null): string {
  return (nome ?? "").trim().split(/\s+/)[0] || "tudo bem";
}

async function tratar(supabase: SupabaseClient, c: Conversa, cfg: Config): Promise<string> {
  const pegou = await supabase.rpc("teo_lock", { p_contact: c.contact_id, p_segundos: 180 });
  if (!pegou.data) return "travada";
  try {
    const msgs: MsgUnnichat[] = await historico(supabase, c.contact_id);
    const reais = msgs.filter((m) => m.senderBy !== "platform");
    const ultima = reais[reais.length - 1];
    const doLead = reais.filter((m) => m.senderBy === "contact");
    const ultimaDoLead = doLead[doLead.length - 1];
    const janelaAberta = Boolean(
      ultimaDoLead && Date.now() - new Date(ultimaDoLead.date).getTime() < JANELA_MS
    );
    const telefone = c.telefone;
    if (!telefone) return "sem telefone";

    let abrir = false;
    let retomar: string | undefined;
    const ocioso = ultima ? Date.now() - new Date(ultima.date).getTime() : Infinity;
    if (c.estado === "encerrado") {
      // Encerrado por falta de resposta: só volta se a pessoa escrever.
      const voltou = ultima?.senderBy === "contact" && ultima.id !== c.ultima_msg_tratada;
      if (c.motivo_humano !== "sem_resposta" || !voltou) {
        await adiar(supabase, c.contact_id, c.motivo_humano === "sem_resposta" ? 2 * 3600_000 : 24 * 3600_000);
        return "encerrado";
      }
    }
    if (c.estado === "novo") {
      if (!janelaAberta) {
        if (c.template_em) return "aguardando resposta do template";
        // Acabou de entrar: a automação do Unnichat está mandando a confirmação.
        // Dá ~10 min pro lead abrir a janela antes de mandar o template.
        if (Date.now() - new Date(c.criado_em).getTime() < 10 * 60_000) return "esperando a janela abrir";
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
      const ultimaDoTeo = [...reais].reverse().find((m) => m.senderBy === "user" && m.origin !== "automation");
      const pendente =
        Boolean(ultimaDoLead) &&
        ultimaDoLead!.id !== c.ultima_msg_tratada &&
        (!ultimaDoTeo || new Date(ultimaDoLead!.date).getTime() > new Date(ultimaDoTeo.date).getTime());
      if (!pendente) {
        if (ultima?.senderBy === "contact") {
          await adiar(supabase, c.contact_id, intervaloDeChecagem(ocioso));
          return "já tratada";
        }
        // O lead parou de responder: é hora de acompanhar?
        const a = await acompanhar(supabase, c, cfg, telefone, ultima, janelaAberta);
        if (!a.retomar) return a.status;
        retomar = a.retomar;
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
    const especialista = especialistaDaConversa(msgs, cfg);
    // A automação "Lista de Espera 2.0" tira o atendente e sorteia um vendedor
    // quando o lead clica nos botões dela. Enquanto o Téo responde, a conversa
    // é dele, a não ser que alguém do time já tenha conversado com o lead.
    if (!especialista && cfg.atendente_id) await garantirTeo(supabase, c, cfg.atendente_id);
    const res = await rodarTeo({
      msgs,
      lead,
      contexto: cfg.contexto,
      precos: cfg.precos ?? "",
      extras: cfg.instrucoes_extras ?? "",
      ficha: c.ficha,
      abrir,
      retomar,
      especialista: especialista ? primeiroNomeVendedor(especialista) : null,
      horariosLivres: (await horariosLivres(supabase, cfg, especialista)).map(
        (l) => `${l.horario} (com ${primeiroNomeVendedor(l.vendedor)})`
      ),
      marcarCall: (args) => marcarCall(supabase, c, cfg, especialista, args),
    });

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
    await supabase
      .from("teo_conversas")
      .update({
        estado: humano ? "humano" : "em_conversa",
        motivo_humano: humano?.motivo ?? null,
        ultima_msg_tratada: ultimaDoLead?.id ?? c.ultima_msg_tratada,
        ultima_resposta_em: new Date().toISOString(),
        respostas,
        ficha,
        erro: null,
        atualizado_em: new Date().toISOString(),
        proxima_checagem: null,
        // Acompanhamento conta a etapa; resposta a quem escreveu zera o silêncio.
        ...(retomar
          ? { followup_etapa: (c.followup_etapa ?? 0) + 1, followup_em: new Date().toISOString() }
          : { followup_etapa: 0, silencio_desde: null, followup_em: null }),
      })
      .eq("contact_id", c.contact_id);

    if (humano) {
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
        : retomar
          ? res.mensagens.length
            ? `acompanhamento ${(c.followup_etapa ?? 0) + 1} (texto)`
            : `acompanhamento ${(c.followup_etapa ?? 0) + 1} pulado`
          : "respondeu";
    await log(supabase, nota, {
      contact_id: c.contact_id,
      nome: c.nome,
      recebida: ultimaDoLead?.message ?? null,
      enviadas: res.mensagens,
      humano,
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
// * 3 min depois do horário: "o Flávio já está na sala te esperando", com o
//   link, a menos que o lead tenha escrito perto da hora.
// Com a janela fechada, os avisos saem pelo template "lembrete_call". O
// follow-up pós-call é do vendedor.
async function cuidarDasCalls(supabase: SupabaseClient, cfg: Config): Promise<string[]> {
  const feitos: string[] = [];
  const agora = Date.now();
  const { data: calls } = await supabase
    .from("teo_calls")
    .select("id, contact_id, nome, inicio, vendedor, meet_url, lembrete_em, passou_vendedor_em, vespera_em, esperando_em, resumo, email, status")
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
          `Oi, ${nome}! Passando pra lembrar: hoje às ${hora} é o seu papo de 20 min com ${vend}. É só entrar por este link na hora: ${k.meet_url}`,
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
        const r = escreveu
          ? "lead por perto"
          : await avisarDaCall(
              supabase,
              cfg,
              conv.telefone,
              await janela(),
              `Oi, ${nome}! O ${vend} já está na sala te esperando. Se ainda não conseguiu entrar, é por este link: ${k.meet_url}`,
              [nome, vend, `começou agora e ${vend} já está na sala te esperando`]
            );
        await supabase.from("teo_calls").update({ esperando_em: new Date().toISOString() }).eq("id", k.id);
        await log(supabase, `te esperando ${r}`, { contact_id: k.contact_id, nome: k.nome, hora });
        if (r !== "lead por perto") feitos.push(`te esperando ${k.nome}`);
      }
      if (!k.passou_vendedor_em && agora >= t - 10 * 60_000) {
        const v = (cfg.vendedores ?? []).find((x) => x.nome === k.vendedor);
        if (v) await unnichat(supabase, "POST", `/contact/${k.contact_id}/assign`, { attendantId: v.atendente_id });
        await anotar(
          supabase,
          k.contact_id,
          `📞 Call agora às ${hora} com ${k.vendedor ?? "o especialista"} (marcada pelo Téo). Depois da call, o follow-up é seu: proposta e link logo em seguida.\n${k.resumo ?? ""}${conv?.ficha ? `\n\nFicha:\n${conv.ficha}` : ""}`
        );
        await supabase
          .from("teo_conversas")
          .update({ estado: "humano", motivo_humano: "call", atualizado_em: new Date().toISOString() })
          .eq("contact_id", k.contact_id);
        await supabase.from("teo_calls").update({ passou_vendedor_em: new Date().toISOString() }).eq("id", k.id);
        await log(supabase, "passou pro vendedor", { contact_id: k.contact_id, nome: k.nome, vendedor: k.vendedor, hora });
        feitos.push(`vendedor ${k.nome}`);
      }
    } catch (e) {
      await log(supabase, "erro na call", { contact_id: k.contact_id, erro: e instanceof Error ? e.message : String(e) });
    }
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
  const inscritos = await autoInscrever(supabase, cfg as Config);
  const tags = await marcarTag(supabase, cfg as Config);

  const campos =
    "contact_id, nome, telefone, estado, ultima_msg_tratada, respostas, ficha, template_em, criado_em, formulario, formulario_em, motivo_humano, followup_etapa, silencio_desde, followup_em";
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

  return NextResponse.json({ ok: true, calls, inscritos, tags, resultado, ms: Date.now() - inicio });
}

// GET: cron da Vercel (vercel.json). POST: disparo manual, já logado.
// A autorização fica no proxy (src/proxy.ts) para todo /api/sync.
export async function GET() {
  return rodar();
}

export async function POST() {
  return rodar();
}
