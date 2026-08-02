import { NextRequest, NextResponse } from "next/server";
import { getAccess } from "@/lib/supabase-server";
import {
  createWhatsappTemplate,
  deleteWhatsappTemplate,
  listWhatsappTemplates,
} from "@/lib/whatsapp";

// Templates de mensagem da Meta.
//
// GET    → lista os templates da conta (com status da aprovação)
// POST   → cria um template novo (entra como PENDING até a Meta revisar)
// DELETE → apaga um template pelo nome
//
// Fora da janela de 24h desde a última mensagem do cliente, template é o ÚNICO
// jeito de o WhatsApp entregar mensagem. Vale pro cliente e vale pro aviso
// interno do time.

export const dynamic = "force-dynamic";

// A Meta só aceita minúsculas, números e _ no nome.
const NOME_OK = /^[a-z0-9_]{1,512}$/;

async function guard() {
  const access = await getAccess();
  return access.authed;
}

export async function GET() {
  if (!(await guard())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const r = await listWhatsappTemplates();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ templates: r.templates });
}

export async function POST(req: NextRequest) {
  if (!(await guard())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);

  const name = String(body?.name ?? "").trim().toLowerCase();
  const texto = String(body?.body ?? "").trim();
  if (!NOME_OK.test(name)) {
    return NextResponse.json(
      { error: "Nome inválido: use só letras minúsculas, números e _ (ex.: aviso_caso_novo)." },
      { status: 400 }
    );
  }
  if (!texto) {
    return NextResponse.json({ error: "O corpo da mensagem é obrigatório." }, { status: 400 });
  }

  const categoria = body?.category === "MARKETING" ? "MARKETING" : "UTILITY";
  const r = await createWhatsappTemplate({
    name,
    category: categoria,
    language: String(body?.language ?? "pt_BR"),
    body: texto,
    footer: body?.footer ? String(body.footer) : undefined,
    exemplos: Array.isArray(body?.exemplos) ? body.exemplos.map(String) : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true, id: r.id, status: r.status });
}

export async function DELETE(req: NextRequest) {
  if (!(await guard())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const name = req.nextUrl.searchParams.get("name") ?? "";
  if (!name) return NextResponse.json({ error: "name é obrigatório." }, { status: 400 });
  const r = await deleteWhatsappTemplate(name);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
