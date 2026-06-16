/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import contacts from "@/data/unnichat-contacts.json";

// Rota ONE-OFF: carrega a base de contatos do Unnichat (export) no banco.
// Protegida pela mesma chave do webhook. Depois de rodar, a tabela
// unnichat_contacts alimenta o cron que resolve o ID e puxa as conversas.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!process.env.UNNICHAT_WEBHOOK_KEY || key !== process.env.UNNICHAT_WEBHOOK_KEY) {
    return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado" }, { status: 501 });

  const rows = (contacts as any[]).map((c) => ({
    phone: c.phone,
    name: c.name ?? null,
    email: c.email ?? null,
    tags: c.tags ?? null,
    fields: c.fields ?? {},
    criado: c.criado ?? null,
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from("unnichat_contacts").upsert(chunk, { onConflict: "phone" });
    if (error) return NextResponse.json({ error: error.message, inserted }, { status: 500 });
    inserted += chunk.length;
  }
  return NextResponse.json({ ok: true, inserted });
}
