import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { historico, type MsgUnnichat } from "@/lib/teo";
import { paginaConversas, type ConversaExport, type MsgExport } from "@/lib/teo-conversas-html";

// Todas as conversas em que o Téo atuou, num HTML só no visual do WhatsApp
// (só admin). Lê o histórico completo de cada contato no Unnichat na hora.
// ?download=1 baixa como arquivo .htm (abre offline, sem o painel).

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const PARALELO = 6;

type Conv = {
  contact_id: string;
  nome: string | null;
  telefone: string | null;
  estado: string | null;
  respostas: number | null;
  ficha: string | null;
  motivo_humano: string | null;
  black_vendedor: string | null;
};

type Call = { contact_id: string; inicio: string; vendedor: string | null; status: string };

function textoTemplate(m: MsgUnnichat): string | null {
  const comps = Array.isArray(m.templateComponents) ? (m.templateComponents as Record<string, unknown>[]) : [];
  const corpo = comps.find((c) => String(c.type ?? "").toLowerCase() === "body");
  let txt = corpo && typeof corpo.text === "string" ? corpo.text : null;
  const params = Array.isArray(m.templateBodyParameters) ? (m.templateBodyParameters as Record<string, unknown>[]) : [];
  if (txt) {
    params.forEach((p, i) => {
      txt = txt!.split(`{{${i + 1}}}`).join(typeof p.text === "string" ? p.text : "");
    });
  }
  return txt;
}

function converter(m: MsgUnnichat, audios: Map<string, string>): MsgExport {
  const tx = m.type === "template" ? textoTemplate(m) : (m.message ?? "").trim() || null;
  let s: MsgExport["s"];
  if (m.senderBy === "platform") s = "p";
  else if (m.type === "note") s = "n";
  else if (m.senderBy === "contact") s = "c";
  else if (m.origin === "unniApi") s = "t";
  else if (m.origin === "automation" || m.type === "template" || m.type === "flow") s = "a";
  else s = "h";
  return { d: m.date, s, tx, ty: m.type || "message", u: m.url ?? null, tr: audios.get(m.id) ?? null };
}

export async function GET(req: NextRequest) {
  const access = await getAccess();
  if (!access.authed || !access.isAdmin) return NextResponse.json({ error: "Só admin." }, { status: 403 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const [{ data: convs, error }, { data: calls }, { data: audios }] = await Promise.all([
    supabase
      .from("teo_conversas")
      .select("contact_id, nome, telefone, estado, respostas, ficha, motivo_humano, black_vendedor"),
    supabase.from("teo_calls").select("contact_id, inicio, vendedor, status").order("inicio", { ascending: true }),
    supabase.from("teo_audios").select("msg_id, texto").not("texto", "is", null),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const callsPor = new Map<string, Call[]>();
  for (const k of (calls ?? []) as Call[]) {
    const l = callsPor.get(k.contact_id) ?? [];
    l.push(k);
    callsPor.set(k.contact_id, l);
  }
  const textoAudio = new Map(
    ((audios ?? []) as { msg_id: string; texto: string }[]).map((a) => [a.msg_id, a.texto])
  );

  // O contato de teste do dono não entra.
  const lista = ((convs ?? []) as Conv[]).filter((c) => !/\(teste\)/i.test(c.nome ?? ""));
  const saida: ConversaExport[] = new Array(lista.length);
  let i = 0;
  async function trabalhador() {
    while (i < lista.length) {
      const idx = i++;
      const c = lista[idx];
      const ks = callsPor.get(c.contact_id) ?? [];
      const base: ConversaExport = {
        id: c.contact_id,
        nome: (c.nome ?? "").trim() || c.telefone || "Sem nome",
        telefone: c.telefone,
        estado: c.estado,
        respostas: c.respostas ?? 0,
        ficha: c.ficha,
        humano: c.motivo_humano,
        vendedor: ks.length ? ks[ks.length - 1].vendedor : c.black_vendedor,
        calls: ks.map((k) => ({ inicio: k.inicio, vendedor: k.vendedor, status: k.status })),
        msgs: [],
      };
      try {
        base.msgs = (await historico(supabase!, c.contact_id)).map((m) => converter(m, textoAudio));
      } catch (e) {
        base.erro = e instanceof Error ? e.message : String(e);
      }
      saida[idx] = base;
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALELO, lista.length) }, trabalhador));

  const agora = new Date();
  const html = paginaConversas(saida, agora);
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  };
  if (req.nextUrl.searchParams.get("download")) {
    const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
    headers["Content-Disposition"] = `attachment; filename="conversas-teo-${dia}.htm"`;
  }
  return new NextResponse(html, { headers });
}
