import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Webhook do Unnichat (CRM/atendimento).
// Configure uma automação no Unnichat para chamar
// https://SEU_DOMINIO/api/webhooks/unnichat?key=UNNICHAT_WEBHOOK_KEY
// quando o contato entrar no funil ou mudar de etapa.
//
// Payload esperado (ajuste a automação para enviar neste formato):
// {
//   "contact_id": "abc123",          // id do contato no Unnichat
//   "name": "Fulano",
//   "email": "fulano@email.com",     // opcional
//   "phone": "+5511999999999",       // opcional
//   "status": "quente",              // frio | lista_espera | quente | convertido | perdido
//   "seller": "Vendedor A",          // opcional: nome do vendedor responsável
//   "source": "meta_ads"             // opcional: meta_ads | google_ads | organico | outro
// }

const VALID_STATUS = ["frio", "lista_espera", "quente", "convertido", "perdido"];

export async function POST(req: NextRequest) {
  const expectedKey = process.env.UNNICHAT_WEBHOOK_KEY;
  if (!expectedKey) {
    return NextResponse.json(
      { error: "UNNICHAT_WEBHOOK_KEY não configurada no servidor." },
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

  // Pings de teste sem corpo ou sem contact_id recebem 200
  // para a URL poder ser validada em painéis externos.
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, action: "ping" });
  }
  const contactId = String(body.contact_id ?? "");
  if (!contactId) {
    return NextResponse.json({ ok: true, action: "ping" });
  }
  const status = VALID_STATUS.includes(body.status) ? body.status : "frio";

  let sellerId: string | null = null;
  if (body.seller) {
    const { data: seller } = await supabase
      .from("sellers")
      .select("id")
      .ilike("name", String(body.seller))
      .maybeSingle();
    sellerId = seller?.id ?? null;
  }

  const { error } = await supabase.from("leads").upsert(
    {
      unnichat_id: contactId,
      name: body.name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      status,
      seller_id: sellerId,
      source: body.source ?? "outro",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "unnichat_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
