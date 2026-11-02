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
}

interface Config {
  ligado: boolean;
  horarios: string[] | null;
  vendedores: { nome: string; email: string; atendente_id: string }[] | null;
  auto_inscrever_ate: string | null;
  contexto: string;
  precos: string | null;
  instrucoes_extras: string | null;
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

// Horários da config daqui a 1h+ em que algum vendedor está livre. Os três
// atendem em paralelo (cada um no seu computador): o mesmo horário aceita uma
// call por vendedor. Rodízio pela carga: em cada horário vai o vendedor livre
// com menos calls marcadas no dia. Se alguém do time já conversou com o lead,
// só os horários dessa pessoa.
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
  const { data: marcadas } = await supabase
    .from("teo_calls")
    .select("inicio, vendedor")
    .neq("status", "cancelada")
    .gte("inicio", new Date(Date.now() - 12 * 3600_000).toISOString());
  const ocupado = new Set((marcadas ?? []).map((m) => `${new Date(m.inicio).getTime()}|${m.vendedor}`));
  const carga = new Map<string, number>(vendedores.map((v) => [v, 0]));
  for (const m of marcadas ?? []) if (m.vendedor) carga.set(m.vendedor, (carga.get(m.vendedor) ?? 0) + 1);
  const out: { horario: string; vendedor: string }[] = [];
  for (const h of todos) {
    const ts = new Date(h).getTime();
    const livres = vendedores.filter((v) => !ocupado.has(`${ts}|${v}`));
    if (livres.length === 0) continue;
    livres.sort((a, b) => (carga.get(a) ?? 0) - (carga.get(b) ?? 0));
    out.push({ horario: local(h), vendedor: livres[0] });
  }
  return out;
}

// Cria o evento com Meet na agenda (Apps Script em teo_agenda_url) e manda o
// convite pro lead e pro vendedor. Sem a ponte configurada, a call fica
// "marcada" e é tentada de novo na próxima rodada.
async function criarConvite(
  supabase: SupabaseClient,
  cfg: Config,
  k: { id: string; nome: string | null; inicio: string; email: string | null; vendedor: string | null; resumo: string | null }
): Promise<boolean> {
  const { data: ag } = await supabase.rpc("teo_agenda_config");
  const url = (ag as { url?: string } | null)?.url;
  const token = (ag as { token?: string } | null)?.token;
  if (!url || !token) return false;
  const v = (cfg.vendedores ?? []).find((x) => x.nome === k.vendedor);
  const convidados = [k.email, v?.email].filter(Boolean);
  const inicio = local(k.inicio);
  const fim = local(new Date(new Date(k.inicio).getTime() + 30 * 60_000).toISOString());
  const res = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      titulo: `Canal do Anfitrião: ${k.nome ?? "lead"} e ${k.vendedor ? primeiroNomeVendedor(k.vendedor) : "especialista"}`,
      // O lead também vê a descrição: só o texto neutro. A ficha vai pro
      // vendedor na nota do Unnichat.
      descricao: `Papo de 20 min com ${k.vendedor ?? "um especialista"}, do Canal do Anfitrião, pra entender o seu caso e montar o plano. É só entrar pelo link do Google Meet no horário.`,
      inicio: `${inicio}:00`,
      fim: `${fim}:00`,
      convidados,
    }),
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
  await log(supabase, "convite enviado", { call_id: k.id, nome: k.nome, convidados, meet: out.meet ?? null });
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
        // Acabou de entrar: a automação do Unnichat está mandando a confirmação.
        // Dá ~10 min pro lead abrir a janela antes de mandar o template.
        if (Date.now() - new Date(c.criado_em).getTime() < 10 * 60_000) return "esperando a janela abrir";
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
    const especialista = especialistaDaConversa(msgs, cfg);
    const res = await rodarTeo({
      msgs,
      lead,
      contexto: cfg.contexto,
      precos: cfg.precos ?? "",
      extras: cfg.instrucoes_extras ?? "",
      ficha: c.ficha,
      abrir,
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

// Antes de cada call: lembrete pelo WhatsApp (~90 min antes, com o link do
// Meet, se a janela de 24h ainda estiver aberta) e, 10 min antes, a conversa
// passa pro vendedor no Unnichat, com a ficha. O follow-up pós-call é dele.
async function cuidarDasCalls(supabase: SupabaseClient, cfg: Config): Promise<string[]> {
  const feitos: string[] = [];
  const agora = Date.now();
  const { data: calls } = await supabase
    .from("teo_calls")
    .select("id, contact_id, nome, inicio, vendedor, meet_url, lembrete_em, passou_vendedor_em, resumo, email, status")
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
    try {
      if (!k.lembrete_em && k.meet_url && conv?.telefone && agora >= t - 90 * 60_000 && agora < t - 5 * 60_000) {
        const msgs = await historico(supabase, k.contact_id);
        const doLead = msgs.filter((m) => m.senderBy === "contact");
        const ult = doLead[doLead.length - 1];
        const aberta = ult && agora - new Date(ult.date).getTime() < JANELA_MS;
        if (aberta) {
          await enviarTexto(
            supabase,
            conv.telefone,
            `Oi, ${primeiroNome(k.nome ?? conv.nome)}! Passando pra lembrar: hoje às ${hora} é o seu papo de 20 min com ${vend}. É só entrar por este link na hora: ${k.meet_url}`
          );
        }
        await supabase.from("teo_calls").update({ lembrete_em: new Date().toISOString() }).eq("id", k.id);
        await log(supabase, aberta ? "lembrete enviado" : "lembrete sem janela", { contact_id: k.contact_id, nome: k.nome, hora });
        feitos.push(`lembrete ${k.nome}`);
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

  const { data: conversas } = await supabase
    .from("teo_conversas")
    .select("contact_id, nome, telefone, estado, ultima_msg_tratada, respostas, ficha, template_em, criado_em")
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

  return NextResponse.json({ ok: true, calls, inscritos, resultado, ms: Date.now() - inicio });
}

// GET: cron da Vercel (vercel.json). POST: disparo manual, já logado.
// A autorização fica no proxy (src/proxy.ts) para todo /api/sync.
export async function GET() {
  return rodar();
}

export async function POST() {
  return rodar();
}
