import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";

// CRUD da base de conhecimento do suporte (treinamento da IA).
// Tudo exige usuário logado no dashboard. A escrita usa a service role.

async function requireAuth() {
  const access = await getAccess();
  return access.authed;
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ items: [] });
  const { data, error } = await admin
    .from("support_kb")
    .select("id,bloco,titulo,conteudo,ativo,ordem,updated_at,valido_ate")
    .order("bloco", { ascending: true })
    .order("ordem", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const titulo = String(body.titulo ?? "").trim();
  if (!titulo) return NextResponse.json({ error: "Título é obrigatório." }, { status: 400 });

  const row: Record<string, unknown> = {
    bloco: String(body.bloco ?? "outro"),
    titulo,
    conteudo: String(body.conteudo ?? ""),
    ativo: body.ativo === undefined ? true : Boolean(body.ativo),
    ordem: Number(body.ordem ?? 0) || 0,
    // valido_ate: "YYYY-MM-DD" ou null (sem validade)
    valido_ate: body.valido_ate ? String(body.valido_ate).slice(0, 10) : null,
    updated_at: new Date().toISOString(),
  };
  if (body.id) row.id = String(body.id);

  const { data, error } = await admin
    .from("support_kb")
    .upsert(row)
    .select("id,bloco,titulo,conteudo,ativo,ordem,updated_at,valido_ate")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Parâmetro 'id' é obrigatório." }, { status: 400 });

  const { error } = await admin.from("support_kb").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
