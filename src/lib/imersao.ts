// Lançamento pago semanal: Imersão A5E (ingresso R$ 27).
//
// Turma = data do sábado do evento (AAAA-MM-DD). Evento sábado 10h às 15h e
// domingo 9h15 às 15h em São Paulo, sem replay. Quem compra a partir de sábado
// 10h (início do evento) já cai na turma do sábado seguinte.
//
// Aqui fica a regra de turma, o processamento da venda (comprador + tags no
// Mailchimp e no Unnichat) e o reembolso. Quem chama: o webhook da Eduzz e o
// cron /api/sync/imersao-tags (retenta tags que falharam).

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const TZ = "America/Sao_Paulo";
export const TAG_FIXA = "imersao-a5e-pago";
export const tagDatada = (turma: string) => `${TAG_FIXA}-${turma}`;

export interface Turma {
  turma_data: string;
  sala_url_sabado: string | null;
  sala_url_domingo: string | null;
  inicio_sabado: string;
  fim_sabado: string;
  inicio_domingo: string;
  fim_domingo: string;
  /** Hora em que a sala abre; vazio = 30 min antes do início. */
  sala_abre_sabado: string | null;
  sala_abre_domingo: string | null;
  grupo_vip_url: string | null;
  grupo_vip_url_2: string | null;
  grupo_vip_cheio: boolean;
  ativa: boolean;
  unnichat_tag_id: string | null;
  created_at: string;
}

export const TURMA_COLS =
  "turma_data, sala_url_sabado, sala_url_domingo, inicio_sabado, fim_sabado, inicio_domingo, fim_domingo, sala_abre_sabado, sala_abre_domingo, grupo_vip_url, grupo_vip_url_2, grupo_vip_cheio, ativa, unnichat_tag_id, created_at";

// ---------- datas em São Paulo ----------

/** Dia-calendário (AAAA-MM-DD) de um instante em São Paulo. */
export function diaSP(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** Soma dias a uma data AAAA-MM-DD (aritmética de calendário, sem fuso). */
export function somaDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Dia da semana (0 = domingo … 6 = sábado) de uma data AAAA-MM-DD. */
function diaDaSemana(dia: string): number {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Instante de "dia às hh:mm" no horário de São Paulo (respeita o fuso do dia). */
export function horaSP(dia: string, hh: number, mm = 0): Date {
  const [y, m, d] = dia.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // offset de SP naquele instante: quanto o relógio de SP difere do UTC
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(guess))
      .map((x) => [x.type, x.value])
  );
  const comoSP = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess - (comoSP - guess));
}

export function ehSabado(dia: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) && diaDaSemana(dia) === 6;
}

/**
 * Hora (em SP) do sábado a partir da qual a compra já vai para a turma seguinte.
 * O mesmo corte divide o custo (gasto CDR no Meta, WhatsApp) e o pós-Imersão no
 * placar e no ROAS: imersao_corte() no Supabase (migração 0161). Mudou aqui,
 * muda lá.
 */
export const HORA_CORTE_SABADO = 10;

/**
 * Turma de quem compra no instante `quando`: o próximo sábado cujo início
 * (sábado 10h em SP) ainda não chegou. Comprou sábado 10h01 → sábado seguinte.
 */
export function turmaParaCompra(quando: Date): string {
  const hoje = diaSP(quando);
  const sabado = somaDias(hoje, (6 - diaDaSemana(hoje) + 7) % 7);
  return horaSP(sabado, HORA_CORTE_SABADO).getTime() <= quando.getTime() ? somaDias(sabado, 7) : sabado;
}

/** Garante a linha da turma (horários padrão vêm do trigger do banco). */
export async function garantirTurma(supabase: SupabaseClient, turma: string): Promise<void> {
  const { error } = await supabase
    .from("imersao_turmas")
    .upsert({ turma_data: turma }, { onConflict: "turma_data", ignoreDuplicates: true });
  if (error) throw new Error(`imersao_turmas: ${error.message}`);
}

/** Turma ativa da sala: a de turma_data mais próxima com fim_domingo >= agora. */
export async function turmaAtiva(supabase: SupabaseClient, agora: Date): Promise<Turma | null> {
  const { data } = await supabase
    .from("imersao_turmas")
    .select(TURMA_COLS)
    .eq("ativa", true)
    .gte("fim_domingo", agora.toISOString())
    .order("turma_data", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Turma | null) ?? null;
}

export async function turmaPorData(supabase: SupabaseClient, turma: string): Promise<Turma | null> {
  const { data } = await supabase.from("imersao_turmas").select(TURMA_COLS).eq("turma_data", turma).maybeSingle();
  return (data as Turma | null) ?? null;
}

// ---------- links fixos: parâmetros repassados ----------

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
// Dados do participante: repassados à sala (Hotwebinar) quando vêm na URL,
// pra ele não ter que digitar de novo.
export const PESSOA_KEYS = ["nome", "name", "email", "telefone", "phone", "whatsapp"] as const;

/** Copia UTMs e dados do participante da URL recebida para o destino. */
export function repassarParams(origem: URLSearchParams, destino: string): string {
  let u: URL;
  try {
    u = new URL(destino);
  } catch {
    return destino;
  }
  for (const k of [...UTM_KEYS, ...PESSOA_KEYS]) {
    const v = origem.get(k);
    if (v && v.trim() && !u.searchParams.has(k)) u.searchParams.set(k, v.trim());
  }
  return u.toString();
}

/**
 * Copia TODOS os parâmetros da URL recebida (utm_*, fbclid, gclid, dados do
 * participante…) para o destino, menos os internos (ex.: "v", versão da LP)
 * e os que o destino já tem.
 */
export function repassarTodos(origem: URLSearchParams, destino: string, ignorar: string[] = []): string {
  let u: URL;
  try {
    u = new URL(destino);
  } catch {
    return destino;
  }
  for (const [k, v] of origem) {
    if (ignorar.includes(k) || !v.trim() || u.searchParams.has(k)) continue;
    u.searchParams.set(k, v.trim());
  }
  return u.toString();
}

/** Registra o clique (best-effort: não pode travar o redirect). */
export async function registrarClique(
  supabase: SupabaseClient,
  req: { headers: Headers; params: URLSearchParams },
  c: {
    rota: "imersao" | "vip" | "lp" | "checkout" | "lp_pv" | "lp_click";
    turma_data: string | null;
    momento: string;
    destino: string | null;
    /** versão da LP (lp/checkout): "longa", "curta"… */
    variante?: string | null;
  }
): Promise<void> {
  const email = (req.params.get("email") ?? "").trim().toLowerCase() || null;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ua = req.headers.get("user-agent") ?? "";
  const visitante = email ?? createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 24);
  const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, req.params.get(k)?.trim().slice(0, 200) || null]));
  try {
    await supabase.from("imersao_cliques").insert({
      ...c,
      ...utm,
      email,
      visitante,
      ua: ua.slice(0, 300) || null,
      ref: req.headers.get("referer")?.slice(0, 300) ?? null,
    });
  } catch {
    /* clique é best-effort */
  }
}

// ---------- Mailchimp ----------

function mailchimpCfg() {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_LIST_ID;
  if (!apiKey || !listId) return null;
  const dc = apiKey.split("-").pop();
  return {
    base: `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members`,
    headers: {
      Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
  };
}

const hashEmail = (email: string) => createHash("md5").update(email.trim().toLowerCase()).digest("hex");

async function mcErro(r: Response): Promise<string> {
  const t = await r.text().catch(() => "");
  try {
    const j = JSON.parse(t);
    return `${r.status} ${j.title ?? ""}: ${j.detail ?? ""}`.slice(0, 300);
  } catch {
    return `${r.status} ${t.slice(0, 200)}`;
  }
}

/**
 * Upsert do membro na lista principal + tags da imersão.
 * ativo=true aplica as tags; false remove (reembolso/chargeback).
 */
export async function tagsMailchimp(
  p: { email: string; nome?: string | null; turma: string },
  ativo: boolean
): Promise<{ ok: boolean; erro?: string }> {
  const cfg = mailchimpCfg();
  if (!cfg) return { ok: false, erro: "Mailchimp: MAILCHIMP_API_KEY/MAILCHIMP_LIST_ID ausentes" };
  const url = `${cfg.base}/${hashEmail(p.email)}`;

  if (ativo) {
    // Não rebaixa ninguém: status_if_new só vale p/ quem não está na lista.
    const base = { email_address: p.email.trim(), status_if_new: "subscribed" };
    const primeiroNome = (p.nome ?? "").trim().split(/\s+/)[0];
    let r = await fetch(url, {
      method: "PUT",
      headers: cfg.headers,
      body: JSON.stringify(primeiroNome ? { ...base, merge_fields: { FNAME: primeiroNome } } : base),
      cache: "no-store",
    });
    // Lista sem o campo FNAME: tenta de novo só com o e-mail.
    if (r.status === 400 && primeiroNome) {
      r = await fetch(url, { method: "PUT", headers: cfg.headers, body: JSON.stringify(base), cache: "no-store" });
    }
    if (!r.ok) return { ok: false, erro: `Mailchimp upsert: ${await mcErro(r)}` };
  }

  const status = ativo ? "active" : "inactive";
  const r = await fetch(`${url}/tags`, {
    method: "POST",
    headers: cfg.headers,
    body: JSON.stringify({ tags: [{ name: TAG_FIXA, status }, { name: tagDatada(p.turma), status }] }),
    cache: "no-store",
  });
  // Remover tag de quem não está na lista: nada a fazer.
  if (!ativo && r.status === 404) return { ok: true };
  if (!r.ok) return { ok: false, erro: `Mailchimp tags: ${await mcErro(r)}` };
  return { ok: true };
}

// ---------- Unnichat ----------
//
// A API do Unnichat tem tag em contato (POST /contact/{id}/tags {tag_id}),
// chamada pela função teo_unnichat() do banco (token no vault). Precisa de:
//  - o contato: achado em leads.unnichat_id pelo e-mail ou telefone. Quem
//    comprou sem nunca ter falado no WhatsApp ainda não existe lá — o cron
//    retenta até a turma acontecer;
//  - o id das tags: a fixa em IMERSAO_UNNICHAT_TAG_ID; a datada em
//    imersao_turmas.unnichat_tag_id. Sem id, a tag fica com a automação do
//    Unnichat (fixa: automação nativa; datada: automação semanal manual) e
//    tags_unnichat_ok fica false.
// Remover tag não está liberado na ponte (teo_unnichat): no reembolso, só o
// Mailchimp é limpo.

async function contatoUnnichat(
  supabase: SupabaseClient,
  email: string | null,
  telefone: string | null
): Promise<string | null> {
  if (email) {
    const { data } = await supabase
      .from("leads")
      .select("unnichat_id")
      .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
      .not("unnichat_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (data?.[0]?.unnichat_id) return data[0].unnichat_id as string;
  }
  const dig = (telefone ?? "").replace(/\D/g, "");
  if (dig.length >= 10) {
    // últimos 8 dígitos: tolera com/sem DDI e o 9 extra do celular
    const { data } = await supabase
      .from("leads")
      .select("unnichat_id, phone")
      .like("phone", `%${dig.slice(-8)}`)
      .not("unnichat_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    const achou = (data ?? []).find((l) => String(l.phone ?? "").replace(/\D/g, "").endsWith(dig.slice(-8)));
    if (achou?.unnichat_id) return achou.unnichat_id as string;
  }
  return null;
}

export async function tagsUnnichat(
  supabase: SupabaseClient,
  p: { email: string | null; telefone: string | null; turma: string }
): Promise<{ ok: boolean; erro?: string }> {
  const tagFixa = process.env.IMERSAO_UNNICHAT_TAG_ID?.trim() || null;
  const { data: t } = await supabase
    .from("imersao_turmas")
    .select("unnichat_tag_id")
    .eq("turma_data", p.turma)
    .maybeSingle();
  const tagData = (t?.unnichat_tag_id as string | null)?.trim() || null;
  if (!tagFixa && !tagData) return { ok: false, erro: "Unnichat: sem id das tags (fica com a automação)" };

  const contato = await contatoUnnichat(supabase, p.email, p.telefone);
  if (!contato) return { ok: false, erro: "Unnichat: contato ainda não existe" };

  const faltando: string[] = [];
  for (const [nome, id] of [
    [TAG_FIXA, tagFixa],
    [tagDatada(p.turma), tagData],
  ] as const) {
    if (!id) {
      faltando.push(`${nome} (sem id)`);
      continue;
    }
    const { data, error } = await supabase.rpc("teo_unnichat", {
      p_method: "POST",
      p_path: `/contact/${contato}/tags`,
      p_body: { tag_id: id },
    });
    const st = (data as { status?: number } | null)?.status ?? 0;
    if (error || st < 200 || st >= 300) faltando.push(`${nome} (${error?.message ?? st})`);
  }
  return faltando.length ? { ok: false, erro: `Unnichat: ${faltando.join(", ")}` } : { ok: true };
}

// ---------- venda / reembolso ----------

export function ehProdutoImersao(data: Record<string, unknown>): boolean {
  const alvo = process.env.IMERSAO_EDUZZ_PRODUCT_ID?.trim();
  if (!alvo) return false;
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const ids = items.map((i) => String(i.productId ?? i.id ?? ""));
  const prod = data.product as Record<string, unknown> | undefined;
  if (prod) ids.push(String(prod.id ?? ""));
  return ids.includes(alvo);
}

interface Comprador {
  id: string;
  eduzz_invoice_id: string;
  email: string | null;
  nome: string | null;
  telefone: string | null;
  turma_data: string;
  status: string;
  tags_mailchimp_ok: boolean;
  tags_unnichat_ok: boolean;
  tags_tentativas: number;
  tags_erro: string | null;
  webhook_log_id: string | null;
}

const COMPRADOR_COLS =
  "id, eduzz_invoice_id, email, nome, telefone, turma_data, status, tags_mailchimp_ok, tags_unnichat_ok, tags_tentativas, tags_erro, webhook_log_id";

/** Aplica o que falta das tags e grava o resultado (comprador + webhook_log). */
export async function aplicarTags(supabase: SupabaseClient, c: Comprador): Promise<{ mailchimp: boolean; unnichat: boolean; erro: string | null }> {
  const erros: string[] = [];
  let mc = c.tags_mailchimp_ok;
  let un = c.tags_unnichat_ok;
  if (!mc) {
    if (!c.email) erros.push("Mailchimp: comprador sem e-mail");
    else {
      try {
        const r = await tagsMailchimp({ email: c.email, nome: c.nome, turma: c.turma_data }, true);
        mc = r.ok;
        if (r.erro) erros.push(r.erro);
      } catch (e) {
        erros.push(`Mailchimp: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  if (!un) {
    try {
      const r = await tagsUnnichat(supabase, { email: c.email, telefone: c.telefone, turma: c.turma_data });
      un = r.ok;
      if (r.erro) erros.push(r.erro);
    } catch (e) {
      erros.push(`Unnichat: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const erro = erros.length ? erros.join(" | ").slice(0, 1000) : null;
  await supabase
    .from("imersao_compradores")
    .update({
      tags_mailchimp_ok: mc,
      tags_unnichat_ok: un,
      tags_erro: erro,
      tags_tentativas: c.tags_tentativas + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", c.id);
  if (c.webhook_log_id) {
    // pendente = o Mailchimp ainda não recebeu as tags (o Unnichat pode
    // depender da automação dele e não trava a venda).
    await supabase
      .from("webhook_log")
      .update({
        etapa: `imersao ${c.turma_data}: mailchimp ${mc ? "ok" : "falhou"}, unnichat ${un ? "ok" : "pendente"}`,
        pendente: !mc,
        erro,
        processado_em: new Date().toISOString(),
      })
      .eq("id", c.webhook_log_id);
  }
  return { mailchimp: mc, unnichat: un, erro };
}

/** Fatura paga do produto da imersão: grava o comprador (idempotente) e aplica as tags. */
export async function processarCompraImersao(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
  webhookLogId: string | null
): Promise<{ turma: string; novo: boolean; mailchimp: boolean; unnichat: boolean; erro: string | null }> {
  const invoiceId = String(data.id ?? data.invoice_id ?? "");
  const { data: existente } = await supabase
    .from("imersao_compradores")
    .select(COMPRADOR_COLS)
    .eq("eduzz_invoice_id", invoiceId)
    .maybeSingle();

  // Reenvio da Eduzz: não muda a turma (que vem do pagamento, não da chegada
  // do aviso) — só retenta o que faltou das tags.
  if (existente) {
    const c = existente as Comprador;
    if (c.status !== "pago" || (c.tags_mailchimp_ok && c.tags_unnichat_ok)) {
      return { turma: c.turma_data, novo: false, mailchimp: c.tags_mailchimp_ok, unnichat: c.tags_unnichat_ok, erro: null };
    }
    return { turma: c.turma_data, novo: false, ...(await aplicarTags(supabase, c)) };
  }

  const buyer = (data.buyer ?? data.student ?? {}) as Record<string, unknown>;
  const pagoEmRaw = String(data.paidAt ?? data.createdAt ?? "");
  const pagoEm = isNaN(new Date(pagoEmRaw).getTime()) ? new Date() : new Date(pagoEmRaw);
  const turma = turmaParaCompra(pagoEm);
  await garantirTurma(supabase, turma);

  const paid = data.paid as { value?: unknown } | undefined;
  const price = data.price as { value?: unknown; paid?: { value?: unknown } } | undefined;
  const valor = Number(paid?.value ?? price?.paid?.value ?? price?.value ?? 0) || null;
  const utm = (data.utm ?? data.tracker ?? data.utmParameters ?? {}) as Record<string, unknown>;
  const u = (k: string) => {
    const v = utm[k] ?? utm[`utm_${k}`];
    return v == null || String(v).trim() === "" ? null : String(v).trim();
  };
  const str = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());

  const { data: novo, error } = await supabase
    .from("imersao_compradores")
    .upsert(
      {
        eduzz_invoice_id: invoiceId,
        email: str(buyer.email)?.toLowerCase() ?? null,
        nome: str(buyer.name),
        telefone: str(buyer.cellphone) ?? str(buyer.phone) ?? str(buyer.phone2),
        turma_data: turma,
        pago_em: pagoEm.toISOString(),
        valor,
        status: "pago",
        utm_source: u("source"),
        utm_medium: u("medium"),
        utm_campaign: u("campaign"),
        utm_content: u("content"),
        utm_term: u("term"),
        webhook_log_id: webhookLogId,
      },
      // corrida entre dois avisos da mesma fatura: o segundo não sobrescreve
      { onConflict: "eduzz_invoice_id", ignoreDuplicates: true }
    )
    .select(COMPRADOR_COLS)
    .maybeSingle();
  if (error) throw new Error(`imersao_compradores: ${error.message}`);
  if (!novo) return { turma, novo: false, mailchimp: false, unnichat: false, erro: null };

  return { turma, novo: true, ...(await aplicarTags(supabase, novo as Comprador)) };
}

/** Reembolso/chargeback: status=reembolsado e tira as tags do Mailchimp. Retorna se a fatura era da imersão. */
export async function reembolsarImersao(supabase: SupabaseClient, invoiceId: string): Promise<boolean> {
  const { data } = await supabase
    .from("imersao_compradores")
    .select(COMPRADOR_COLS)
    .eq("eduzz_invoice_id", invoiceId)
    .maybeSingle();
  if (!data) return false;
  const c = data as Comprador;
  let erro: string | null = null;
  if (c.email) {
    try {
      const r = await tagsMailchimp({ email: c.email, nome: c.nome, turma: c.turma_data }, false);
      if (!r.ok) erro = r.erro ?? "Mailchimp: falhou ao remover tags";
    } catch (e) {
      erro = `Mailchimp: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  await supabase
    .from("imersao_compradores")
    .update({
      status: "reembolsado",
      // sem tag ativa no Mailchimp (se a remoção funcionou)
      tags_mailchimp_ok: erro ? c.tags_mailchimp_ok : false,
      tags_erro: erro ? `reembolso: ${erro}` : c.tags_erro,
      updated_at: new Date().toISOString(),
    })
    .eq("id", c.id);
  return true;
}

/** Retenta tags pendentes (cron). Só compradores pagos de turmas que ainda não acabaram. */
export async function retentarTags(supabase: SupabaseClient, limite = 40) {
  const hoje = diaSP(new Date());
  const { data } = await supabase
    .from("imersao_compradores")
    .select(COMPRADOR_COLS)
    .eq("status", "pago")
    .or("tags_mailchimp_ok.eq.false,tags_unnichat_ok.eq.false")
    .gte("turma_data", somaDias(hoje, -1))
    .lt("tags_tentativas", 200)
    .order("created_at", { ascending: true })
    .limit(limite);
  const out = { vistos: 0, mailchimp_ok: 0, unnichat_ok: 0 };
  for (const c of (data ?? []) as Comprador[]) {
    out.vistos++;
    const r = await aplicarTags(supabase, c);
    if (r.mailchimp && !c.tags_mailchimp_ok) out.mailchimp_ok++;
    if (r.unnichat && !c.tags_unnichat_ok) out.unnichat_ok++;
  }
  return out;
}
