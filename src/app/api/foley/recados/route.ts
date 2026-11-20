import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Caixa de recados painel <-> Foley (migração 0136). Fernando, 20/11: "To
// cansado de ser garoto de recados de vcs. Não conseguem conversar não?".
//
// Authorization: Bearer <FOLEY_API_TOKEN>
// GET  /api/foley/recados          recados do painel ainda não lidos (marca como lidos)
//      /api/foley/recados?todos=1  os últimos 50, dos dois lados, lidos ou não
// POST /api/foley/recados          { "texto": "...", "assunto": "opcional" } — recado do Foley

export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  const token = process.env.FOLEY_API_TOKEN;
  return Boolean(token) && req.headers.get("authorization") === `Bearer ${token}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, erro: "banco não configurado" }, { status: 500 });

  if (req.nextUrl.searchParams.get("todos") === "1") {
    const { data, error } = await supabase
      .from("foley_recados")
      .select("id, criado_em, de, assunto, texto, lido_em")
      .order("criado_em", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, recados: data ?? [] });
  }

  const { data, error } = await supabase
    .from("foley_recados")
    .select("id, criado_em, assunto, texto")
    .eq("de", "painel")
    .is("lido_em", null)
    .order("criado_em", { ascending: true })
    .limit(50);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length) {
    await supabase.from("foley_recados").update({ lido_em: new Date().toISOString() }).in("id", ids);
  }
  return NextResponse.json({ ok: true, recados: data ?? [] });
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
  const texto = typeof corpo.texto === "string" ? corpo.texto.trim().slice(0, 20000) : "";
  if (!texto) return NextResponse.json({ ok: false, erro: "mande o recado em \"texto\"" }, { status: 400 });
  const assunto = typeof corpo.assunto === "string" ? corpo.assunto.trim().slice(0, 200) || null : null;

  const { data, error } = await supabase
    .from("foley_recados")
    .insert({ de: "foley", assunto, texto })
    .select("id, criado_em")
    .single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id, recebido_em: data.criado_em });
}
