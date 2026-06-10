import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Importa o gasto diário dos últimos 30 dias da conta de anúncios do Meta.
// Requer META_ADS_ACCESS_TOKEN (token de sistema com ads_read) e
// META_ADS_ACCOUNT_ID (ex.: act_1234567890).
// Chame periodicamente (cron do Vercel, por exemplo): POST /api/sync/meta-ads

export async function POST() {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  const account = process.env.META_ADS_ACCOUNT_ID;
  if (!token || !account) {
    return NextResponse.json(
      { error: "Configure META_ADS_ACCESS_TOKEN e META_ADS_ACCOUNT_ID." },
      { status: 501 }
    );
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  const url = new URL(`https://graph.facebook.com/v21.0/${account}/insights`);
  url.searchParams.set("fields", "spend");
  url.searchParams.set("date_preset", "last_30d");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("access_token", token);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Graph API: ${text}` }, { status: 502 });
  }
  const json = await res.json();
  const rows = (json.data ?? []).map(
    (d: { date_start: string; spend: string }) => ({
      date: d.date_start,
      platform: "meta_ads",
      amount: Number(d.spend),
      campaign: null,
    })
  );

  const { error } = await supabase
    .from("ad_spend")
    .upsert(rows, { onConflict: "date,platform,campaign" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, imported: rows.length });
}
