import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { graphToken, vttParaTexto } from "@/lib/graph";
import { pareceIngles, transcreverGravacoes, turnosDaTeams, type Gravacao } from "@/lib/transcrever-gravacao";

// Acervo das calls do Teams (tabela call_transcricoes), separado do Téo: guarda
// a transcrição e as gravações de toda call da agenda do anfitriao@, pra
// análise semanal e mensal. Roda a cada 30 min (vercel.json):
//  1. registra as reuniões do Teams da agenda dos últimos 3 dias que já
//     terminaram há 40 min, mais as calls do Téo com link do Teams;
//  2. para as que ainda aguardam, busca a transcrição e as gravações na Graph;
//  3. refaz, a partir da gravação, a transcrição que a Teams fez no idioma
//     errado (retranscrever = true: marcado aqui quando o texto sai em inglês,
//     ou à mão). Uma por rodada, porque baixa o vídeo inteiro.
// Precisa das permissões de aplicativo OnlineMeetingTranscript.Read.All e
// OnlineMeetingRecording.Read.All, e da política de acesso do Teams
// (Agenda-Canal) concedida ao anfitriao@. Sem elas a call fica "aguardando"
// com o erro anotado, e é buscada de novo por até 14 dias.

export const maxDuration = 300;

const JANELA_DIAS = 3;
const DEPOIS_DO_FIM_MS = 40 * 60_000;
const DURACAO_CALL_MS = 30 * 60_000;
const RECHECAR_MS = 30 * 60_000;
// Resposta certa mas sem transcrição um dia depois: a call não aconteceu (ou
// ninguém falou). Com erro (permissão, reunião não achada), tenta por 14 dias.
const DESISTIR_VAZIO_MS = 24 * 3600_000;
const DESISTIR_ERRO_MS = 14 * 86400_000;
// Gravou mas a Teams não transcreveu até 1h30 depois do fim: refaz pela gravação.
const SEM_TRANSCRICAO_MS = 90 * 60_000;
const POR_RODADA = 6;
// A refação baixa vídeo e transcreve: só começa uma nova até 200 s de rodada
// (maxDuration 300 s).
const REFAZER_ATE_MS = 200_000;

type Cfg = {
  teams_tenant_id: string | null;
  teams_client_id: string | null;
  teams_organizador_id: string | null;
  vendedores: { nome: string; email: string }[] | null;
};

type Linha = {
  join_url: string;
  evento_id: string | null;
  assunto: string | null;
  inicio: string | null;
  fim: string | null;
  participantes: { nome: string | null; email: string | null }[] | null;
  teo_call_id: string | null;
  contact_id: string | null;
  lead_nome: string | null;
  vendedor: string | null;
};

type Evento = {
  id: string;
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  isCancelled?: boolean;
  onlineMeeting?: { joinUrl?: string } | null;
  attendees?: { emailAddress?: { name?: string; address?: string } }[];
};

async function log(supabase: SupabaseClient, note: string, body: Record<string, unknown>) {
  await supabase.from("webhook_log").insert({ source: "calls", note, body });
}

// A Graph devolve "2026-11-04T16:30:00.0000000" (UTC pelo cabeçalho Prefer).
function utc(s?: string | null): string | null {
  if (!s) return null;
  const d = new Date(/(z|[+-]\d\d:\d\d)$/i.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function erroGraph(status: number, j: unknown): string {
  const msg = (j as { error?: { message?: string } } | null)?.error?.message ?? "";
  return `${status} ${msg}`.trim().slice(0, 300);
}

async function registrar(
  supabase: SupabaseClient,
  cfg: Cfg,
  auth: Record<string, string>,
  org: string
): Promise<number> {
  const agora = Date.now();
  const de = new Date(agora - JANELA_DIAS * 86400_000).toISOString();
  const ate = new Date(agora - DEPOIS_DO_FIM_MS).toISOString();
  const linhas = new Map<string, Linha>();
  const emails = new Map((cfg.vendedores ?? []).map((v) => [v.email?.toLowerCase(), v.nome]));

  const eventos: Evento[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/users/${org}/calendarView?startDateTime=${de}&endDateTime=${ate}` +
    `&$select=id,subject,start,end,isCancelled,onlineMeeting,attendees&$top=100`;
  while (url && eventos.length < 500) {
    const r: Response = await fetch(url, { headers: { ...auth, Prefer: 'outlook.timezone="UTC"' } });
    const j = (await r.json().catch(() => null)) as { value?: Evento[]; "@odata.nextLink"?: string } | null;
    if (!r.ok) {
      await log(supabase, "agenda falhou", { erro: erroGraph(r.status, j) });
      break;
    }
    eventos.push(...(j?.value ?? []));
    url = j?.["@odata.nextLink"] ?? null;
  }
  for (const e of eventos) {
    const join = e.onlineMeeting?.joinUrl;
    const fim = utc(e.end?.dateTime);
    if (!join || e.isCancelled || !fim || fim > ate) continue;
    const participantes = (e.attendees ?? []).map((a) => ({
      nome: a.emailAddress?.name ?? null,
      email: a.emailAddress?.address?.toLowerCase() ?? null,
    }));
    const vendedor = participantes.map((p) => (p.email ? emails.get(p.email) : undefined)).find(Boolean) ?? null;
    linhas.set(join, {
      join_url: join,
      evento_id: e.id,
      assunto: e.subject ?? null,
      inicio: utc(e.start?.dateTime),
      fim,
      participantes,
      teo_call_id: null,
      contact_id: null,
      lead_nome: null,
      vendedor,
    });
  }

  // Calls do Téo: dá o lead e o vendedor, e cobre um link do Teams que não
  // esteja num evento da agenda.
  const { data: calls } = await supabase
    .from("teo_calls")
    .select("id, contact_id, nome, vendedor, inicio, meet_url, evento_id")
    .neq("status", "cancelada")
    .like("meet_url", "https://teams.microsoft.com/%")
    .gte("inicio", de)
    .lte("inicio", new Date(agora - DEPOIS_DO_FIM_MS - DURACAO_CALL_MS).toISOString());
  for (const k of calls ?? []) {
    const join = String(k.meet_url);
    const ja = linhas.get(join);
    const inicio = new Date(k.inicio).toISOString();
    linhas.set(join, {
      join_url: join,
      evento_id: ja?.evento_id ?? k.evento_id ?? null,
      assunto: ja?.assunto ?? null,
      inicio: ja?.inicio ?? inicio,
      fim: ja?.fim ?? new Date(new Date(inicio).getTime() + DURACAO_CALL_MS).toISOString(),
      participantes: ja?.participantes ?? null,
      teo_call_id: k.id,
      contact_id: k.contact_id ?? null,
      lead_nome: k.nome ?? null,
      vendedor: k.vendedor ?? ja?.vendedor ?? null,
    });
  }
  if (!linhas.size) return 0;

  // Só entra o que é novo: o que já está no acervo não é tocado.
  const { data: novas, error } = await supabase
    .from("call_transcricoes")
    .upsert([...linhas.values()], { onConflict: "join_url", ignoreDuplicates: true })
    .select("join_url");
  if (error) {
    await log(supabase, "registro falhou", { erro: error.message });
    return 0;
  }
  return novas?.length ?? 0;
}

async function buscar(
  supabase: SupabaseClient,
  auth: Record<string, string>,
  org: string
): Promise<string[]> {
  const agora = Date.now();
  const { data: fila } = await supabase
    .from("call_transcricoes")
    .select("join_url, reuniao_id, lead_nome, assunto, fim, criado_em")
    .eq("status", "aguardando")
    .or(`checado_em.is.null,checado_em.lte.${new Date(agora - RECHECAR_MS).toISOString()}`)
    .order("checado_em", { ascending: true, nullsFirst: true })
    .limit(POR_RODADA);
  const base = `https://graph.microsoft.com/v1.0/users/${org}/onlineMeetings`;
  const feitos: string[] = [];
  for (const k of fila ?? []) {
    const marca: Record<string, unknown> = { checado_em: new Date().toISOString() };
    const passou = agora - new Date(k.fim ?? k.criado_em).getTime();
    const nome = k.lead_nome ?? k.assunto ?? k.join_url.slice(0, 60);
    try {
      let reuniao = k.reuniao_id as string | null;
      if (!reuniao) {
        // O link vai codificado inteiro: a Graph compara com o JoinWebUrl
        // exatamente como ele é (com os %3a do próprio link).
        const filtro = encodeURIComponent(`JoinWebUrl eq '${k.join_url.replace(/'/g, "''")}'`);
        const r = await fetch(`${base}?$filter=${filtro}`, { headers: auth });
        const j = (await r.json().catch(() => null)) as { value?: { id?: string }[] } | null;
        reuniao = j?.value?.[0]?.id ?? null;
        if (!reuniao) {
          marca.erro = `reunião não achada: ${erroGraph(r.status, j)}`;
          if (passou > DESISTIR_ERRO_MS) marca.status = "sem_transcricao";
          await supabase.from("call_transcricoes").update(marca).eq("join_url", k.join_url);
          continue;
        }
        marca.reuniao_id = reuniao;
      }
      const [tr, gr] = await Promise.all([
        fetch(`${base}/${reuniao}/transcripts`, { headers: auth }),
        fetch(`${base}/${reuniao}/recordings`, { headers: auth }),
      ]);
      const tj = (await tr.json().catch(() => null)) as { value?: { id: string }[] } | null;
      const gj = (await gr.json().catch(() => null)) as
        | { value?: { id: string; createdDateTime?: string; endDateTime?: string; recordingContentUrl?: string }[] }
        | null;
      if (gr.ok && gj?.value?.length) {
        marca.gravacoes = gj.value.map((x) => ({
          id: x.id,
          inicio: x.createdDateTime ?? null,
          fim: x.endDateTime ?? null,
          url: x.recordingContentUrl ?? null,
        }));
      }
      // Situação das gravações, pra saber se a call gravou mesmo quando a
      // transcrição falha (vai junto do erro da transcrição).
      const situacaoGravacoes = gr.ok
        ? `gravações: ${gj?.value?.length ?? 0}`
        : `gravações: ${erroGraph(gr.status, gj)}`;
      if (!tr.ok) {
        marca.erro = `transcrições: ${erroGraph(tr.status, tj)} | ${situacaoGravacoes}`;
        if (passou > DESISTIR_ERRO_MS) marca.status = "sem_transcricao";
        await supabase.from("call_transcricoes").update(marca).eq("join_url", k.join_url);
        continue;
      }
      const lista = tj?.value ?? [];
      const partes: string[] = [];
      for (const t of lista) {
        const c = await fetch(`${base}/${reuniao}/transcripts/${t.id}/content?$format=text/vtt`, {
          headers: { Authorization: auth.Authorization },
        });
        if (c.ok) partes.push(vttParaTexto(await c.text()));
      }
      const texto = partes.filter(Boolean).join("\n\n");
      if (texto) {
        marca.status = "ok";
        marca.transcricao = texto;
        marca.transcricao_ids = lista.map((t) => t.id);
        marca.transcrito_em = new Date().toISOString();
        marca.transcricao_fonte = "teams";
        marca.erro = null;
        // Teams no idioma errado: refaz pela gravação na próxima etapa.
        if (pareceIngles(texto) && Array.isArray(marca.gravacoes) && marca.gravacoes.length) marca.retranscrever = true;
        feitos.push(nome);
        await log(supabase, "transcrição salva", { join_url: k.join_url, nome, caracteres: texto.length });
      } else {
        marca.erro = `transcrições: ${lista.length ? "vazia" : "nenhuma ainda"} | ${situacaoGravacoes}`;
        // A Teams não transcreveu, mas a call gravou: 1h30 depois do fim,
        // transcreve pela gravação (sem os nomes de quem fala).
        if (Array.isArray(marca.gravacoes) && marca.gravacoes.length && passou > SEM_TRANSCRICAO_MS) {
          marca.retranscrever = true;
        } else if (passou > DESISTIR_VAZIO_MS) marca.status = "sem_transcricao";
      }
    } catch (e) {
      marca.erro = e instanceof Error ? e.message.slice(0, 300) : String(e);
    }
    await supabase.from("call_transcricoes").update(marca).eq("join_url", k.join_url);
  }
  return feitos;
}

// Duração gravada (s), pra fila andar das curtas pras longas.
function duracaoGravada(gravacoes: unknown): number {
  const lista = Array.isArray(gravacoes) ? (gravacoes as { inicio?: string | null; fim?: string | null }[]) : [];
  const total = lista.reduce((soma, g) => {
    const ini = g.inicio ? new Date(g.inicio).getTime() : NaN;
    const fim = g.fim ? new Date(g.fim).getTime() : NaN;
    return soma + (Number.isFinite(ini) && Number.isFinite(fim) ? Math.max(0, fim - ini) / 1000 : 3600);
  }, 0);
  return lista.length ? total : Infinity;
}

// Refaz pela gravação as transcrições marcadas com retranscrever, das
// gravações mais curtas pras mais longas (uma sala esquecida aberta não trava
// as calls normais), enquanto a rodada tiver tempo. Para no primeiro limite do
// provedor: as próximas bateriam no mesmo limite. O texto da Teams fica em
// transcricao_teams (dá os nomes de quem fala).
async function refazer(
  supabase: SupabaseClient,
  auth: Record<string, string>,
  inicioRodada: number
): Promise<string[]> {
  const { data: marcadas } = await supabase
    .from("call_transcricoes")
    .select("join_url, lead_nome, assunto, gravacoes, transcricao, transcricao_teams, transcricao_fonte")
    .eq("retranscrever", true)
    .limit(30);
  const fila = [...(marcadas ?? [])].sort((a, b) => duracaoGravada(a.gravacoes) - duracaoGravada(b.gravacoes));
  const feitos: string[] = [];
  for (const k of fila) {
    if (Date.now() - inicioRodada > REFAZER_ATE_MS) break;
    const nome = k.lead_nome ?? k.assunto ?? k.join_url.slice(0, 60);
    const teams = (k.transcricao_teams as string | null) ?? (k.transcricao_fonte === "gravação" ? null : (k.transcricao as string | null));
    const r = await transcreverGravacoes((k.gravacoes ?? []) as Gravacao[], auth, turnosDaTeams(teams));
    if (r.ok) {
      await supabase
        .from("call_transcricoes")
        .update({
          transcricao: r.texto,
          transcricao_teams: teams,
          transcricao_fonte: "gravação",
          retranscrever: false,
          status: "ok",
          erro: null,
          transcrito_em: new Date().toISOString(),
        })
        .eq("join_url", k.join_url);
      await log(supabase, "transcrição refeita pela gravação", { join_url: k.join_url, nome, caracteres: r.texto.length });
      feitos.push(nome);
    } else {
      // Limite de áudio por hora do provedor (o mesmo dos áudios do WhatsApp):
      // passa, então fica marcada e tenta de novo na próxima rodada. Outro
      // erro não tenta de novo sozinho (baixa o vídeo inteiro a cada vez):
      // marque retranscrever de novo depois de resolver.
      const limite = /rate limit|too many requests|\b429\b|try again in/i.test(r.erro);
      await supabase
        .from("call_transcricoes")
        .update({ retranscrever: limite, erro: `refazer pela gravação: ${r.erro}`.slice(0, 300) })
        .eq("join_url", k.join_url);
      await log(supabase, "refazer pela gravação falhou", { join_url: k.join_url, nome, erro: r.erro });
      if (limite) break;
    }
  }
  return feitos;
}

async function rodar() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  const inicio = Date.now();
  const { data: cfg } = await supabase
    .from("teo_config")
    .select("teams_tenant_id, teams_client_id, teams_organizador_id, vendedores")
    .eq("id", 1)
    .maybeSingle();
  const org = cfg?.teams_organizador_id as string | null | undefined;
  if (!cfg || !org) return NextResponse.json({ ok: true, configurado: false });
  const g = await graphToken(supabase, cfg as Cfg);
  if (!g) return NextResponse.json({ ok: true, configurado: false });
  if (!g.ok) {
    await log(supabase, "token falhou", { erro: g.erro });
    return NextResponse.json({ ok: false, erro: g.erro }, { status: 502 });
  }
  const novas = await registrar(supabase, cfg as Cfg, g.auth, org);
  const salvas = await buscar(supabase, g.auth, org);
  // A etapa pesada só entra com folga no tempo da função (maxDuration).
  const refeitas = Date.now() - inicio < 60_000 ? await refazer(supabase, g.auth, inicio) : [];
  return NextResponse.json({ ok: true, novas, salvas, refeitas, ms: Date.now() - inicio });
}

// GET: cron da Vercel (vercel.json). POST: disparo manual, já logado.
// A autorização fica no proxy (src/proxy.ts) para todo /api/sync.
export async function GET() {
  return rodar();
}

export async function POST() {
  return rodar();
}
