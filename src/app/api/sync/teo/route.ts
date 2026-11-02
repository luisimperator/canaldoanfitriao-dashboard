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
}

interface Config {
  ligado: boolean;
  horarios: string[] | null;
  auto_inscrever_ate: string | null;
  contexto: string;
  max_respostas: number;
  atendente_id: string | null;
  template_abertura_id: string | null;
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

async function carregarLead(supabase: SupabaseClient, contactId: string): Promise<LeadTeo> {
  const { data } = await supabase
    .from("leads")
    .select("name, created_at, extra")
    .eq("unnichat_id", contactId)
    .maybeSingle();
  const extra = (data?.extra ?? {}) as Record<string, unknown>;
  const respostas: Record<string, string> = {};
  for (const [k, rot] of Object.entries(CAMPOS_PESQUISA)) {
    const v = limpa(extra[k]);
    if (v) respostas[rot] = v;
  }
  const tags = Array.isArray(extra.tags) ? (extra.tags as unknown[]).map(String) : [];
  return { nome: data?.name ?? null, criadoEm: data?.created_at ?? null, respostas, tags };
}

async function log(supabase: SupabaseClient, note: string, body: Record<string, unknown>) {
  await supabase.from("webhook_log").insert({ source: "teo", note, body });
}

// Inscreve sozinho os leads novos da Lista de Espera (fora da Black): quem já
// respondeu a pesquisa entra na hora; quem não respondeu, depois de 15 min.
async function autoInscrever(supabase: SupabaseClient, cfg: Config): Promise<number> {
  if (!cfg.auto_inscrever_ate || new Date(cfg.auto_inscrever_ate) < new Date()) return 0;
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { data: leads } = await supabase
    .from("leads")
    .select("unnichat_id, name, phone, extra")
    .gte("created_at", hojeSP)
    .not("unnichat_id", "is", null);
  const candidatos = (leads ?? []).filter((l) => {
    const tags = (Array.isArray(l.extra?.tags) ? l.extra.tags : []).map((t: unknown) => String(t).toLowerCase());
    return tags.includes("lista-de-espera") && !tags.some((t: string) => t.includes("black-2026"));
  });
  if (candidatos.length === 0) return 0;
  const ids = candidatos.map((l) => l.unnichat_id as string);
  const { data: ja } = await supabase.from("teo_conversas").select("contact_id").in("contact_id", ids);
  const jaSet = new Set((ja ?? []).map((r) => r.contact_id));
  const { data: eventos } = await supabase
    .from("lead_events")
    .select("unnichat_id, event_at")
    .in("unnichat_id", ids)
    .order("event_at", { ascending: true });
  const primeiro = new Map<string, string>();
  for (const e of eventos ?? []) if (!primeiro.has(e.unnichat_id)) primeiro.set(e.unnichat_id, e.event_at);
  let n = 0;
  for (const l of candidatos) {
    const id = l.unnichat_id as string;
    if (jaSet.has(id)) continue;
    const tags = (Array.isArray(l.extra?.tags) ? l.extra.tags : []).map((t: unknown) => String(t).toLowerCase());
    const respondeu = tags.includes("respondeu-pesquisa");
    const entrou = primeiro.get(id);
    const passou15 = entrou ? Date.now() - new Date(entrou).getTime() > 15 * 60_000 : false;
    if (!respondeu && !passou15) continue;
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

// "2026-11-03T10:00:00-03:00" -> "2026-11-03T10:00" (horário de Brasília)
function local(iso: string): string {
  return new Date(iso)
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .slice(0, 16)
    .replace(" ", "T");
}

// Horários da config que ainda estão livres (sem call marcada) e daqui a 1h+.
async function horariosLivres(supabase: SupabaseClient, cfg: Config): Promise<string[]> {
  const todos = (cfg.horarios ?? []).filter((h) => new Date(h).getTime() > Date.now() + 3600_000);
  if (todos.length === 0) return [];
  const { data: ocupados } = await supabase
    .from("teo_calls")
    .select("inicio")
    .neq("status", "cancelada")
    .gte("inicio", new Date().toISOString());
  const ocup = new Set((ocupados ?? []).map((o) => new Date(o.inicio).getTime()));
  return todos.filter((h) => !ocup.has(new Date(h).getTime())).map(local);
}

async function marcarCall(
  supabase: SupabaseClient,
  c: Conversa,
  cfg: Config,
  args: { horario: string; email: string; resumo: string }
): Promise<string> {
  const livres = await horariosLivres(supabase, cfg);
  const horario = args.horario.trim().slice(0, 16);
  if (!livres.includes(horario)) {
    return `Esse horário não está livre. Livres agora: ${livres.slice(0, 8).join(", ") || "nenhum"}.`;
  }
  const email = args.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "E-mail inválido: peça o e-mail de novo.";
  const { error } = await supabase.from("teo_calls").insert({
    contact_id: c.contact_id,
    nome: c.nome,
    inicio: `${horario}:00-03:00`,
    email,
    resumo: args.resumo,
  });
  if (error) {
    return /duplicate|unique/i.test(error.message)
      ? `Esse horário acabou de ser ocupado. Livres agora: ${(await horariosLivres(supabase, cfg)).slice(0, 8).join(", ")}.`
      : `Não consegui marcar (${error.message}). Diga que vai confirmar o horário e chame passar_para_humano.`;
  }
  const [dia, hora] = horario.split("T");
  const quando = `${dia.slice(8, 10)}/${dia.slice(5, 7)} às ${hora}`;
  await anotar(supabase, c.contact_id, `📅 Call marcada pelo Téo: ${quando} — ${email}\n${args.resumo}`);
  await log(supabase, "call marcada", { contact_id: c.contact_id, nome: c.nome, horario, email });
  return `Marcado: ${quando} (horário de Brasília), convite vai pro e-mail ${email}.`;
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
    if (c.estado === "novo") {
      if (!janelaAberta) {
        if (c.template_em) return "aguardando resposta do template";
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
      abrir = ultima?.senderBy !== "contact";
    } else {
      if (!ultima || ultima.senderBy !== "contact") return "nada novo";
      if (ultima.id === c.ultima_msg_tratada) return "já tratada";
      if (Date.now() - new Date(ultima.date).getTime() < ESPERA_MS) return "esperando o lead terminar";
      if (!janelaAberta) return "janela fechada";
    }

    const lead = await carregarLead(supabase, c.contact_id);
    if (!lead.nome) lead.nome = c.nome;
    const res = await rodarTeo({
      msgs,
      lead,
      contexto: cfg.contexto,
      ficha: c.ficha,
      abrir,
      horariosLivres: await horariosLivres(supabase, cfg),
      marcarCall: (args) => marcarCall(supabase, c, cfg, args),
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
    await log(supabase, humano ? "passou pro time" : abrir ? "abriu conversa" : "respondeu", {
      contact_id: c.contact_id,
      nome: c.nome,
      recebida: ultimaDoLead?.message ?? null,
      enviadas: res.mensagens,
      humano,
    });
    return humano ? `humano (${humano.motivo})` : abrir ? "abriu" : "respondeu";
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

async function rodar() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Sem ANTHROPIC_API_KEY." }, { status: 501 });

  const { data: cfg } = await supabase.from("teo_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg?.ligado) return NextResponse.json({ ok: true, ligado: false });

  const inicio = Date.now();
  const inscritos = await autoInscrever(supabase, cfg as Config);

  const { data: conversas } = await supabase
    .from("teo_conversas")
    .select("contact_id, nome, telefone, estado, ultima_msg_tratada, respostas, ficha, template_em")
    .eq("ativo", true)
    .in("estado", ["novo", "em_conversa"]);
  const fila = [...((conversas ?? []) as Conversa[])];
  const resultado: Record<string, string> = {};

  async function pista() {
    while (fila.length > 0 && Date.now() - inicio < ORCAMENTO_MS) {
      const c = fila.shift()!;
      resultado[c.nome ?? c.contact_id] = await tratar(supabase!, c, cfg as Config);
    }
  }
  await Promise.all(Array.from({ length: PARALELO }, () => pista()));

  return NextResponse.json({ ok: true, inscritos, resultado, ms: Date.now() - inicio });
}

// GET: cron da Vercel (vercel.json). POST: disparo manual, já logado.
// A autorização fica no proxy (src/proxy.ts) para todo /api/sync.
export async function GET() {
  return rodar();
}

export async function POST() {
  return rodar();
}
