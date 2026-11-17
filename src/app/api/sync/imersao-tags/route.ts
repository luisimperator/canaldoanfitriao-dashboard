import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { retentarTags } from "@/lib/imersao";

// Imersão A5E: retenta as tags (Mailchimp/Unnichat) dos compradores em que
// falharam na hora da venda. O Unnichat costuma falhar por o contato ainda não
// existir lá (comprou sem nunca ter falado no WhatsApp) — vale tentar de novo
// até a turma acontecer.
// GET: cron da Vercel (vercel.json). POST: botão do painel, já logado.
// A autorização fica no proxy (src/proxy.ts) para todo /api/sync.

export const maxDuration = 60;

async function rodar() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  try {
    return NextResponse.json({ ok: true, ...(await retentarTags(supabase)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET() {
  return rodar();
}

export async function POST() {
  return rodar();
}
