import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isSalesTeamTag } from "@/lib/leads";

// Importa inscritos da lista do Mailchimp como leads, lendo as TAGS de cada
// contato. Contatos com tag de time de vendas (lista-de-espera /
// gigantes-super-interessados / precisa de ajuda) entram como "lista_espera";
// os demais ficam "frio" (base / newsletter).
// Requer MAILCHIMP_API_KEY (formato xxxx-usNN) e MAILCHIMP_LIST_ID.
// Reconciliado por mailchimp_id; re-rodar atualiza tags/status sem duplicar
// e sem mexer em pipeline_stage/seller_id/source (que vêm do Unnichat).
// A classificação de tags do time de vendas mora em @/lib/leads.

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
  let listaEspera = 0;
  let offset = 0;
  const pageSize = 500;

  for (;;) {
    const url =
      `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members` +
      `?count=${pageSize}&offset=${offset}` +
      `&fields=members.id,members.email_address,members.full_name,members.timestamp_opt,members.tags,total_items`;
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
      tags?: { id: number; name: string }[];
    }[] = json.members ?? [];
    if (members.length === 0) break;

    const rows = members.map((m) => {
      const tagNames = (m.tags ?? []).map((t) => t.name);
      const salesTeam = tagNames.some(isSalesTeamTag);
      if (salesTeam) listaEspera += 1;
      return {
        mailchimp_id: m.id,
        email: m.email_address,
        name: m.full_name || null,
        created_at: (m.timestamp_opt || new Date().toISOString()).slice(0, 10),
        // source fica de fora: novos contatos herdam o default 'outro' e quem
        // já existe preserva a origem real (vinda do Unnichat). Antes o
        // Mailchimp carimbava 'meta_ads' em toda a base e poluía a origem.
        status: salesTeam ? "lista_espera" : "frio",
        extra: { tags: tagNames },
        updated_at: new Date().toISOString(),
      };
    });
    // ignoreDuplicates: false -> atualiza tags/status de quem já existe.
    // pipeline_stage/seller_id/unnichat_id não entram aqui, então são preservados.
    const { error } = await supabase
      .from("leads")
      .upsert(rows, { onConflict: "mailchimp_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    imported += rows.length;

    offset += pageSize;
    if (offset >= (json.total_items ?? 0)) break;
  }

  return NextResponse.json({ ok: true, imported, listaEspera });
}
