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

  const body = await req.json();
  // Formato MyEduzz (webhook 2.0): { event: "myeduzz.invoice_paid", data: {...} }
  const event: string = body.event ?? "";
  const data = body.data ?? {};
  const invoiceId = String(data.id ?? data.invoice_id ?? "");
  if (!invoiceId) {
    return NextResponse.json({ error: "payload sem id de fatura" }, { status: 400 });
  }

  if (event.includes("refund")) {
    await supabase.from("sales").update({ status: "reembolsada" }).eq("eduzz_invoice_id", invoiceId);
    return NextResponse.json({ ok: true, action: "refunded" });
  }

  const amount = Number(data.price?.value ?? data.paid?.value ?? data.value ?? 0);
  const saleDate = String(data.paidAt ?? data.createdAt ?? new Date().toISOString()).slice(0, 10);
  const product = String(data.items?.[0]?.name ?? data.product?.name ?? "Canal do Anfitrião");

  // O vendedor é atribuído depois, cruzando com o lead do Unnichat
  // (por e-mail/telefone) ou manualmente no Supabase.
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

  const { error } = await supabase.from("sales").upsert(
    {
      eduzz_invoice_id: invoiceId,
      sale_date: saleDate,
      amount,
      product,
      status: "paga",
      seller_id: sellerId,
      lead_id: leadId,
    },
    { onConflict: "eduzz_invoice_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, action: "paid" });
}
