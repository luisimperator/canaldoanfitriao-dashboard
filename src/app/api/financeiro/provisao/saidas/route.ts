import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// CRUD das saídas programadas (pagamentos agendados) da Provisão de caixa.
// POST cadastra {descricao, valor, data}; DELETE ?id= remove.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const descricao = String(body?.descricao ?? "").trim();
  const valor = Number(body?.valor);
  const data = String(body?.data ?? "");
  if (!descricao) {
    return NextResponse.json({ error: "Descreva o pagamento (ex.: Boletos Camila)." }, { status: 400 });
  }
  if (!Number.isFinite(valor) || valor <= 0 || valor > 100_000_000) {
    return NextResponse.json({ error: "Informe o valor em reais." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: "Informe a data do pagamento." }, { status: 400 });
  }

  const prevista = Boolean(body?.prevista);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
  const { error } = await supabase
    .from("provisao_saidas")
    .insert({ descricao, valor, data, prevista });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Informe o id." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
  const { error } = await supabase.from("provisao_saidas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
