import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Feedback de cada call pro vendedor, pro agente do OpenClaw no PC do Fernando
// mandar no WhatsApp privado do vendedor (Fernando, 19/11). O feedback é gerado
// sozinho quando a transcrição da call chega (/api/sync/call-feedbacks, tabela
// call_feedbacks, migração 0128).
//
// Authorization: Bearer <OPENCLAW_FEEDBACK_TOKEN>   (variável de ambiente da Vercel)
//
// Cada feedback vai pra dois lugares (Fernando, 19/11): o WhatsApp privado do
// vendedor (campo texto) e o grupo "Gestão Comercial" (campo texto_grupo, o
// mesmo texto com o nome do vendedor no topo). Cada destino tem a sua entrega.
//
// GET /api/openclaw/feedbacks
//   Os prontos com algum destino ainda não entregue, do mais antigo pro mais
//   novo; pendente_vendedor / pendente_grupo dizem onde falta mandar.
//   ?call=<teo_call_id>  um só, entregue ou não (e o status, se ainda não ficou pronto)
//   ?todos=1             os das últimas 72 h, entregues ou não
// POST /api/openclaw/feedbacks
//   { "id": "<id do feedback>", "destino": "vendedor" | "grupo", "status": "enviado" | "erro", "detalhe": "opcional" }
//   (sem destino = "vendedor"). "enviado" marca a entrega naquele destino;
//   "erro" só registra o detalhe e o destino continua pendente. Nada é apagado.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function autorizado(req: NextRequest): boolean {
  const token = process.env.OPENCLAW_FEEDBACK_TOKEN;
  return Boolean(token) && req.headers.get("authorization") === `Bearer ${token}`;
}

type Vendedor = { nome: string; email?: string | null; whatsapp?: string | null };

type Linha = {
  id: string;
  teo_call_id: string;
  vendedor: string | null;
  lead: string | null;
  call_inicio: string | null;
  status: string;
  texto: string | null;
  gerado_em: string | null;
  entregue_em: string | null;
  entrega_detalhe: string | null;
  entregue_grupo_em: string | null;
  entrega_grupo_detalhe: string | null;
};

const CAMPOS =
  "id, teo_call_id, vendedor, lead, call_inicio, status, texto, gerado_em, entregue_em, entrega_detalhe, entregue_grupo_em, entrega_grupo_detalhe";

function quando(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatar(l: Linha, time: Vendedor[]) {
  const v = time.find((x) => x.nome === l.vendedor);
  const primeiro = (l.vendedor ?? "").split(/\s+/)[0] || null;
  const pronto = l.status === "pronto" && Boolean(l.texto);
  return {
    id: l.id,
    teo_call_id: l.teo_call_id,
    status: l.status,
    vendedor: l.vendedor,
    vendedor_primeiro_nome: primeiro,
    vendedor_email: v?.email ?? null,
    vendedor_whatsapp: v?.whatsapp ?? null,
    lead: l.lead,
    call_inicio: l.call_inicio,
    call_quando: quando(l.call_inicio),
    texto: l.texto,
    texto_grupo: l.texto ? `*Feedback pro ${primeiro ?? "vendedor"}*\n\n${l.texto}` : null,
    gerado_em: l.gerado_em,
    pendente_vendedor: pronto && !l.entregue_em,
    pendente_grupo: pronto && !l.entregue_grupo_em,
    entregue_em: l.entregue_em,
    entrega_detalhe: l.entrega_detalhe,
    entregue_grupo_em: l.entregue_grupo_em,
    entrega_grupo_detalhe: l.entrega_grupo_detalhe,
  };
}

async function timeDeVendas(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<Vendedor[]> {
  const { data } = await supabase.from("teo_config").select("vendedores").eq("id", 1).maybeSingle();
  return ((data?.vendedores ?? []) as Vendedor[]).filter((v) => v && typeof v.nome === "string");
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, erro: "banco não configurado" }, { status: 500 });
  const time = await timeDeVendas(supabase);
  const call = req.nextUrl.searchParams.get("call");
  if (call) {
    if (!/^[0-9a-f-]{36}$/i.test(call)) return NextResponse.json({ ok: false, erro: "call inválida" }, { status: 400 });
    const { data } = await supabase.from("call_feedbacks").select(CAMPOS).eq("teo_call_id", call).maybeSingle();
    if (!data) {
      const { data: t } = await supabase
        .from("call_transcricoes")
        .select("status")
        .eq("teo_call_id", call)
        .maybeSingle();
      return NextResponse.json({
        ok: true,
        feedback: null,
        situacao: t ? `transcrição ${t.status}: o feedback sai quando a transcrição estiver ok` : "call sem transcrição no sistema",
      });
    }
    return NextResponse.json({ ok: true, feedback: formatar(data as Linha, time) });
  }
  const todos = req.nextUrl.searchParams.get("todos") === "1";
  let q = supabase.from("call_feedbacks").select(CAMPOS).order("gerado_em", { ascending: true }).limit(100);
  q = todos
    ? q.gte("criado_em", new Date(Date.now() - 72 * 3600_000).toISOString())
    : q.eq("status", "pronto").or("entregue_em.is.null,entregue_grupo_em.is.null");
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, feedbacks: ((data ?? []) as Linha[]).map((l) => formatar(l, time)) });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, erro: "banco não configurado" }, { status: 500 });
  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }
  const id = String(corpo.id ?? "");
  const status = String(corpo.status ?? "");
  const destino = String(corpo.destino ?? "vendedor");
  const detalhe = typeof corpo.detalhe === "string" ? corpo.detalhe.slice(0, 500) : null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, erro: "id inválido" }, { status: 400 });
  if (status !== "enviado" && status !== "erro") {
    return NextResponse.json({ ok: false, erro: 'status tem que ser "enviado" ou "erro"' }, { status: 400 });
  }
  if (destino !== "vendedor" && destino !== "grupo") {
    return NextResponse.json({ ok: false, erro: 'destino tem que ser "vendedor" ou "grupo"' }, { status: 400 });
  }
  const { data: atual } = await supabase
    .from("call_feedbacks")
    .select("id, entregue_em, entregue_grupo_em")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return NextResponse.json({ ok: false, erro: "feedback não encontrado" }, { status: 404 });
  const agora = new Date().toISOString();
  const grupo = destino === "grupo";
  const campos =
    status === "enviado"
      ? grupo
        ? { entregue_grupo_em: atual.entregue_grupo_em ?? agora, entrega_grupo_detalhe: detalhe, atualizado_em: agora }
        : { entregue_em: atual.entregue_em ?? agora, entregue_por: "openclaw", entrega_detalhe: detalhe, atualizado_em: agora }
      : grupo
        ? { entrega_grupo_detalhe: `erro: ${detalhe ?? "sem detalhe"}`, atualizado_em: agora }
        : { entrega_detalhe: `erro: ${detalhe ?? "sem detalhe"}`, atualizado_em: agora };
  const { error } = await supabase.from("call_feedbacks").update(campos).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  await supabase.from("webhook_log").insert({
    source: "calls",
    note:
      status === "enviado"
        ? grupo
          ? "feedback entregue no grupo"
          : "feedback entregue ao vendedor"
        : grupo
          ? "feedback: erro na entrega no grupo"
          : "feedback: erro na entrega ao vendedor",
    body: { feedback_id: id, detalhe },
  });
  return NextResponse.json({ ok: true, id, destino, status });
}
