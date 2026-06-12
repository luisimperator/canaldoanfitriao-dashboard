import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Webhook de vendas da Eduzz.
// Cadastre https://SEU_DOMINIO/api/webhooks/eduzz?key=EDUZZ_WEBHOOK_KEY no
// painel da Eduzz para os eventos de fatura (myeduzz.invoice_paid /
// myeduzz.invoice_refunded). Cada fatura paga vira uma linha em `sales`;
// reembolso atualiza o status.

export async function POST(req: NextRequest) {
  const expectedKey = process.env.EDUZZ_WEBHOOK_KEY;
  if (!expectedKey) {
    return NextResponse.json(
      { error: "EDUZZ_WEBHOOK_KEY não configurada no servidor." },
      { status: 501 }
    );
  }
  if (req.nextUrl.searchParams.get("key") !== expectedKey) {
    return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  // Pings de verificação da Eduzz chegam sem corpo ou sem fatura:
  // responde 200 para a URL poder ser ativada no painel.
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, action: "ping" });
  }
  const event: string = body.event ?? "";
  const data = body.data ?? {};
  const invoiceId = String(data.id ?? data.invoice_id ?? "");
  if (!invoiceId) {
    return NextResponse.json({ ok: true, action: "ping" });
  }

  if (event.includes("refund")) {
    await supabase.from("sales").update({ status: "reembolsada" }).eq("eduzz_invoice_id", invoiceId);
    return NextResponse.json({ ok: true, action: "refunded" });
  }

  const amount = Number(data.price?.value ?? data.paid?.value ?? data.value ?? 0);
  const saleDate = String(data.paidAt ?? data.createdAt ?? new Date().toISOString()).slice(0, 10);
  const product = String(data.items?.[0]?.name ?? data.product?.name ?? "Canal do Anfitrião");

  // UTMs vêm em campos diferentes conforme a versão do payload; guarda o que houver.
  const utm = data.utm ?? data.tracker ?? data.utmParameters ?? null;
  await supabase.from("webhook_log").insert({ source: "eduzz", note: event, body });

  // O vendedor é atribuído cruzando com o lead do Unnichat (por e-mail),
  // ou pelo nome no utm_source (links individuais dos vendedores).
  const buyerEmail: string | null = data.buyer?.email ?? null;
  let sellerId: string | null = null;
  let leadId: string | null = null;
  if (buyerEmail) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id, seller_id")
      .eq("email", buyerEmail)
      .maybeSingle();
    if (lead) {
      leadId = lead.id;
      sellerId = lead.seller_id;
      await supabase.from("leads").update({ status: "convertido" }).eq("id", lead.id);
    }
  }
  if (!sellerId && utm) {
    const utmSource = String(utm.source ?? utm.utm_source ?? "").toLowerCase();
    if (utmSource) {
      const { data: sellers } = await supabase
        .from("sellers")
        .select("id, name")
        .eq("is_active", true);
      const match = (sellers ?? []).find((s) =>
        utmSource.includes(
          s.name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        )
      );
      sellerId = match?.id ?? null;
    }
  }

  const { error } = await supabase.from("sales").upsert(
    {
      eduzz_invoice_id: invoiceId,
      sale_date: saleDate,
      amount,
      product,
      status: "paga",
      seller_id: sellerId,
      lead_id: leadId,
      utm,
    },
    { onConflict: "eduzz_invoice_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, action: "paid" });
}
