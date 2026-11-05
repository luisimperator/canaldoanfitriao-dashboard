import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { graphToken } from "@/lib/graph";

// Agenda das calls em formato iCalendar, pra assinar no Google Agenda ("Outras
// agendas > Do URL") só pra acompanhar. Lê a agenda do anfitriao@ pela Graph
// (toda reunião, marcada pelo Téo ou não) e completa com lead, vendedor e
// resumo das calls do Téo. Público, mas só com a chave certa (?k=, guardada em
// teo_config.agenda_token); sem ela responde 404. Sem a Graph, cai pras calls
// do Téo.

export const maxDuration = 30;

const DIAS_ANTES = 30;
const DIAS_DEPOIS = 120;

type Evento = {
  id: string;
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  isCancelled?: boolean;
  onlineMeeting?: { joinUrl?: string } | null;
  location?: { displayName?: string } | null;
};

type Call = {
  id: string;
  status: string;
  nome: string | null;
  vendedor: string | null;
  inicio: string;
  meet_url: string | null;
  resumo: string | null;
};

function utc(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(/(z|[+-]\d\d:\d\d)$/i.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ics(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Linhas de no máximo 75 bytes, continuação começando com espaço (RFC 5545).
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = "";
  for (const ch of linha) {
    if (Buffer.byteLength(atual + ch, "utf8") > (partes.length ? 74 : 75)) {
      partes.push(atual);
      atual = ch;
    } else atual += ch;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

function primeiroNome(nome: string | null): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

function vevento(o: {
  uid: string;
  inicio: Date;
  fim: Date;
  titulo: string;
  local: string | null;
  descricao: string | null;
}): string[] {
  const linhas = [
    "BEGIN:VEVENT",
    `UID:${o.uid}@painel.canaldoanfitriao.com.br`,
    `DTSTAMP:${ics(new Date())}`,
    `DTSTART:${ics(o.inicio)}`,
    `DTEND:${ics(o.fim)}`,
    `SUMMARY:${esc(o.titulo)}`,
  ];
  if (o.local) linhas.push(`LOCATION:${esc(o.local)}`);
  if (o.descricao) linhas.push(`DESCRIPTION:${esc(o.descricao)}`);
  linhas.push("END:VEVENT");
  return linhas;
}

function naoAchou() {
  return new Response("Not found", { status: 404 });
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return naoAchou();
  const k = request.nextUrl.searchParams.get("k") ?? "";
  const { data: cfg } = await supabase
    .from("teo_config")
    .select("agenda_token, teams_tenant_id, teams_client_id, teams_organizador_id")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.agenda_token || k.length < 16 || k !== cfg.agenda_token) return naoAchou();

  const agora = Date.now();
  const de = new Date(agora - DIAS_ANTES * 86400_000);
  const ate = new Date(agora + DIAS_DEPOIS * 86400_000);

  const { data: callsDb } = await supabase
    .from("teo_calls")
    .select("id, status, nome, vendedor, inicio, meet_url, resumo")
    .neq("nome", "Teste Teams")
    .gte("inicio", de.toISOString())
    .lte("inicio", ate.toISOString());
  const todas = (callsDb ?? []) as Call[];
  // Evento da agenda cuja call foi cancelada (ou remarcada) não entra, mesmo
  // que o convite antigo ainda esteja na agenda do anfitriao@.
  const canceladas = new Set(todas.filter((c) => c.status === "cancelada" && c.meet_url).map((c) => c.meet_url as string));
  const calls = todas.filter((c) => c.status !== "cancelada");
  const porLink = new Map(calls.filter((c) => c.meet_url).map((c) => [c.meet_url as string, c]));

  const linhas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Canal do Anfitriao//Calls//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Calls do Canal",
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  // Agenda do anfitriao@ pela Graph; sem ela, só as calls do Téo.
  let eventos: Evento[] | null = null;
  const g = cfg.teams_organizador_id ? await graphToken(supabase, cfg).catch(() => null) : null;
  if (g?.ok) {
    eventos = [];
    let url: string | null =
      `https://graph.microsoft.com/v1.0/users/${cfg.teams_organizador_id}/calendarView?startDateTime=${de.toISOString()}&endDateTime=${ate.toISOString()}` +
      `&$select=id,subject,start,end,isCancelled,onlineMeeting,location&$top=200`;
    while (url && eventos.length < 1000) {
      const r: Response = await fetch(url, { headers: { ...g.auth, Prefer: 'outlook.timezone="UTC"' } });
      if (!r.ok) {
        eventos = null;
        break;
      }
      const j = (await r.json().catch(() => null)) as { value?: Evento[]; "@odata.nextLink"?: string } | null;
      eventos.push(...(j?.value ?? []));
      url = j?.["@odata.nextLink"] ?? null;
    }
  }

  const usados = new Set<string>();
  for (const e of eventos ?? []) {
    const inicio = utc(e.start?.dateTime);
    const fim = utc(e.end?.dateTime);
    if (e.isCancelled || !inicio || !fim) continue;
    const link = e.onlineMeeting?.joinUrl ?? null;
    if (link && canceladas.has(link) && !porLink.has(link)) continue;
    const call = link ? porLink.get(link) : undefined;
    if (call) usados.add(call.id);
    const titulo = call
      ? `Call: ${call.nome ?? "lead"} × ${primeiroNome(call.vendedor) || "especialista"}`
      : (e.subject ?? "Evento");
    const descricao = call
      ? [`Com ${call.vendedor ?? "o especialista"} (marcada pelo Téo).`, call.resumo ?? "", link ? `Teams: ${link}` : ""]
          .filter(Boolean)
          .join("\n\n")
      : link
        ? `Teams: ${link}`
        : null;
    linhas.push(...vevento({ uid: e.id, inicio, fim, titulo, local: link ?? e.location?.displayName ?? null, descricao }));
  }
  // Calls do Téo que não apareceram na agenda (ou a Graph falhou).
  for (const c of calls) {
    if (usados.has(c.id)) continue;
    const inicio = new Date(c.inicio);
    linhas.push(
      ...vevento({
        uid: c.id,
        inicio,
        fim: new Date(inicio.getTime() + 30 * 60_000),
        titulo: `Call: ${c.nome ?? "lead"} × ${primeiroNome(c.vendedor) || "especialista"}`,
        local: c.meet_url,
        descricao: [`Com ${c.vendedor ?? "o especialista"} (marcada pelo Téo).`, c.resumo ?? "", c.meet_url ? `Link: ${c.meet_url}` : ""]
          .filter(Boolean)
          .join("\n\n"),
      })
    );
  }
  linhas.push("END:VCALENDAR");

  return new Response(linhas.map(dobrar).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
