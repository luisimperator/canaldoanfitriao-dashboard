import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Importa o gasto diário dos últimos 90 dias da conta de anúncios do Meta.
// Janela de 90 (e não 30) para o sync se auto-corrigir depois de um período
// com o cron parado — foi assim que fev–mai/2026 ficaram com buracos
// permanentes de gasto (e CAC/ROAS irreais) quando a janela era de 30 dias.
// Requer META_ADS_ACCESS_TOKEN (token de sistema com ads_read) e
// META_ADS_ACCOUNT_ID (ex.: act_1234567890). Aceita VÁRIAS contas separadas
// por vírgula (ex.: act_111,act_222) — o negócio roda com "Canal do Anfitrião"
// e "CA2 - Canal do Anfitrião"; o gasto do dia é a SOMA das contas.
// O cron da Vercel (vercel.json) chama por GET todo dia às 9h10 UTC (6h10 em
// São Paulo); o GET reusa o mesmo handler. POST continua valendo para disparo
// manual.

export async function POST() {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  const accounts = (process.env.META_ADS_ACCOUNT_ID ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (!token || accounts.length === 0) {
    return NextResponse.json(
      { error: "Configure META_ADS_ACCESS_TOKEN e META_ADS_ACCOUNT_ID." },
      { status: 501 }
    );
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  const until = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

  // Soma o gasto por DIA entre as contas antes do upsert — upsert por conta
  // sobrescreveria o valor da outra (a linha de ad_spend é por dia+plataforma).
  const byDate = new Map<string, number>();
  for (const account of accounts) {
    const url = new URL(`https://graph.facebook.com/v21.0/${account}/insights`);
    url.searchParams.set("fields", "spend");
    url.searchParams.set("time_range", JSON.stringify({ since, until }));
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", token);

    // A Graph API pagina a resposta (default: 25 linhas). O código antigo lia
    // só a primeira página — com time_increment=1 isso importava 25 dos 30
    // dias, mesmo com o cron saudável. Segue paging.next até o fim.
    let next: string | null = url.toString();
    for (let page = 0; next && page < 20; page++) {
      const res: Response = await fetch(next, { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `Graph API (${account}): ${text}` }, { status: 502 });
      }
      const json = await res.json();
      for (const d of json.data ?? []) {
        const date = String(d.date_start);
        byDate.set(date, (byDate.get(date) ?? 0) + Number(d.spend));
      }
      next = json.paging?.next ?? null;
    }
  }

  const rows = [...byDate.entries()].map(([date, amount]) => ({
    date,
    platform: "meta_ads",
    amount: Math.round(amount * 100) / 100,
    campaign: null,
  }));

  const { error } = await supabase
    .from("ad_spend")
    .upsert(rows, { onConflict: "date,platform,campaign" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, imported: rows.length, accounts: accounts.length });
}

// Cron da Vercel só faz GET.
export async function GET() {
  return POST();
}
