import { NextRequest, NextResponse } from "next/server";
import { suggestRule } from "@/lib/support-ai";
import { getAccess } from "@/lib/supabase-server";

// POST /api/support/suggest-rule
// Transforma uma "bronca do chefe" (modo treino) numa regra pronta pra salvar.
// Body: { note: string, customerMessage?: string, aiReply?: string }

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const access = await getAccess();
  if (!access.authed) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: { note?: unknown; customerMessage?: unknown; aiReply?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note) {
    return NextResponse.json({ error: "note é obrigatório." }, { status: 400 });
  }

  try {
    const suggestion = await suggestRule(note, {
      customerMessage: typeof body.customerMessage === "string" ? body.customerMessage : undefined,
      aiReply: typeof body.aiReply === "string" ? body.aiReply : undefined,
    });
    return NextResponse.json(suggestion);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.json({ error: `Falha ao sugerir regra: ${msg}` }, { status: 500 });
  }
}
