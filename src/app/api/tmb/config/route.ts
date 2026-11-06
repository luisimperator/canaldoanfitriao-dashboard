import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";

// Configuração da entrega TMB (só admin): modo teste, destino dos avisos,
// template de reserva, produto da Black na TMB e filtro da Black.
export async function POST(req: NextRequest) {
  const access = await getAccess();
  if (!access.authed || !access.isAdmin) return NextResponse.json({ error: "Só admin." }, { status: 403 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const campos: Record<string, unknown> = {};
  if (typeof b.modo_teste === "boolean") campos.modo_teste = b.modo_teste;
  if (typeof b.aviso_telefones === "string") {
    campos.aviso_telefones = b.aviso_telefones
      .split(/[,;\n]/)
      .map((t) => t.replace(/[^\d]/g, ""))
      .filter((t) => t.length >= 10);
  }
  if (typeof b.aviso_template_id === "string") campos.aviso_template_id = b.aviso_template_id.trim() || null;
  if (typeof b.tmb_produto_id === "string") campos.tmb_produto_id = b.tmb_produto_id.trim() || null;
  if (typeof b.filtro_black === "string" && b.filtro_black.trim()) {
    try {
      new RegExp(b.filtro_black.trim(), "i");
    } catch {
      return NextResponse.json({ error: "Filtro inválido (regex)." }, { status: 400 });
    }
    campos.filtro_black = b.filtro_black.trim();
  }
  if (!Object.keys(campos).length) return NextResponse.json({ error: "Nada pra salvar." }, { status: 400 });
  campos.atualizado_em = new Date().toISOString();
  const { error } = await supabase.from("tmb_config").update(campos).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from("webhook_log").insert({ source: "tmb_painel", note: "config alterada", body: { por: access.email, campos } });
  return NextResponse.json({ ok: true, mensagem: "Salvo" });
}
