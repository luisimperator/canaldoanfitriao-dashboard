import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { canAccess } from "@/lib/access";

// Grava a âncora manual do saldo Eduzz (a Eduzz não tem endpoint de saldo).
// A página soma sozinha o que liberou desde o momento informado.
//
// Exige sessão E a aba de Provisão — o porteiro só garante sessão.

export async function POST(req: NextRequest) {
  const access = await getAccess();
  if (!access.authed || !canAccess("/financeiro/provisao", access)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const valor = Number(body?.valor);
  if (!Number.isFinite(valor) || valor < 0 || valor > 100_000_000) {
    return NextResponse.json({ error: "Informe o saldo em reais (número válido)." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const { error } = await supabase
    .from("provisao_ajustes")
    .upsert({ chave: "saldo_eduzz", valor, updated_at: new Date().toISOString() });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, valor });
}
