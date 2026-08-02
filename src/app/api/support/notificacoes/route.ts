import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { sendWhatsappTemplate } from "@/lib/whatsapp";

// Quem recebe aviso de caso novo no WhatsApp.
//
// GET    → lista
// POST   → adiciona (ou reativa quem já existia com o mesmo número)
// PATCH  → liga/desliga, muda nome ou filtro de motivos
// DELETE → remove
//
// POST { teste: true, telefone } → manda o template de aviso pra esse número,
// pra conferir que chega antes de contar com ele num caso real.

export const dynamic = "force-dynamic";

async function guard() {
  const access = await getAccess();
  if (!access.authed) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  return admin;
}

/** Telefone brasileiro escrito de qualquer jeito → dígitos com DDI. */
function normalizar(bruto: string): string | null {
  let d = (bruto || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`; // faltou o DDI
  return d.length >= 12 && d.length <= 15 ? d : null;
}

async function flag(chave: string, padrao: string): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) return padrao;
  const { data } = await admin
    .from("whatsapp_flags_extra")
    .select("valor")
    .eq("chave", chave)
    .maybeSingle();
  return data?.valor?.trim() || padrao;
}

export async function GET() {
  const admin = await guard();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { data, error } = await admin
    .from("support_notificacoes")
    .select("id,nome,telefone,ativo,motivos,observacao,criado_em")
    .order("criado_em", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pessoas: data ?? [] });
}

export async function POST(req: NextRequest) {
  const admin = await guard();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const body = await req.json().catch(() => null);

  const telefone = normalizar(String(body?.telefone ?? ""));
  if (!telefone) {
    return NextResponse.json(
      { error: "Telefone inválido. Use DDD + número (ex.: 11 91234-5678)." },
      { status: 400 }
    );
  }

  // Disparo de teste: não mexe no cadastro, só prova que o aviso chega.
  if (body?.teste) {
    const envio = await sendWhatsappTemplate(
      telefone,
      await flag("alerta_template", "caso_suporte_novo"),
      await flag("alerta_idioma", "pt_BR"),
      ["teste", "ninguém (disparo de teste)", "Se você recebeu isso, o aviso está funcionando."]
    );
    return envio.ok
      ? NextResponse.json({ ok: true, id: envio.id })
      : NextResponse.json({ error: envio.error ?? "falha ao enviar" }, { status: 502 });
  }

  const nome = String(body?.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "O nome é obrigatório." }, { status: 400 });

  const row = {
    nome,
    telefone,
    ativo: body?.ativo === false ? false : true,
    motivos: Array.isArray(body?.motivos) && body.motivos.length > 0 ? body.motivos.map(String) : null,
    observacao: body?.observacao ? String(body.observacao) : null,
  };

  // Mesmo número cadastrado de novo = reativa e atualiza, em vez de dar erro
  // de chave duplicada na cara de quem está preenchendo.
  const { data, error } = await admin
    .from("support_notificacoes")
    .upsert(row, { onConflict: "telefone" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PATCH(req: NextRequest) {
  const admin = await guard();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body?.ativo === "boolean") patch.ativo = body.ativo;
  if (body?.nome !== undefined) patch.nome = String(body.nome);
  if (body?.motivos !== undefined) {
    patch.motivos =
      Array.isArray(body.motivos) && body.motivos.length > 0 ? body.motivos.map(String) : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nada para atualizar." }, { status: 400 });
  }

  const { error } = await admin.from("support_notificacoes").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await guard();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
  const { error } = await admin.from("support_notificacoes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
