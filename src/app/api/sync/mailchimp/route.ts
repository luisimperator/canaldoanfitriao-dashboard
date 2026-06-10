import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Importa inscritos da lista do Mailchimp como leads (status inicial: frio).
// Requer MAILCHIMP_API_KEY (formato xxxx-usNN) e MAILCHIMP_LIST_ID.
// Os leads são reconciliados por mailchimp_id, então rodar de novo não duplica.

export async function POST() {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_LIST_ID;
  if (!apiKey || !listId) {
    return NextResponse.json(
      { error: "Configure MAILCHIMP_API_KEY e MAILCHIMP_LIST_ID." },
      { status: 501 }
    );
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  const dc = apiKey.split("-").pop(); // datacenter vem no fim da key
  let imported = 0;
  let offset = 0;
  const pageSize = 500;

  for (;;) {
    const url =
      `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members` +
      `?count=${pageSize}&offset=${offset}&fields=members.id,members.email_address,members.full_name,members.timestamp_opt,total_items`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Mailchimp: ${text}` }, { status: 502 });
    }
    const json = await res.json();
    const members: {
      id: string;
      email_address: string;
      full_name: string;
      timestamp_opt: string;
    }[] = json.members ?? [];
    if (members.length === 0) break;

    const rows = members.map((m) => ({
      mailchimp_id: m.id,
      email: m.email_address,
      name: m.full_name || null,
      created_at: (m.timestamp_opt || new Date().toISOString()).slice(0, 10),
      source: "meta_ads", // origem predominante; ajuste com merge fields/UTM se quiser detalhar
      status: "frio",
    }));
    const { error, count } = await supabase
      .from("leads")
      .upsert(rows, { onConflict: "mailchimp_id", ignoreDuplicates: true, count: "exact" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    imported += count ?? rows.length;

    offset += pageSize;
    if (offset >= (json.total_items ?? 0)) break;
  }

  return NextResponse.json({ ok: true, imported });
}
