import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Webhook do Unnichat (CRM/atendimento).
// As automações do Unnichat chamam:
//   https://SEU_DOMINIO/api/webhooks/unnichat?key=UNNICHAT_WEBHOOK_KEY
// nos eventos: contato criado, mudança de etapa do pipeline, ganho/perdido.
//
// Formato REAL enviado pelo Unnichat (aninhado em "contact"):
// {
//   "contact": {
//     "id": "019ec...", "name": "Fulano", "email": "f@x.com",
//     "phoneNumber": "5511999999999", "tags": "Lista-de-Espera",
//     "fields": { "estagio": "lista_espera", "tipo": "...", "produto": "..." }
//   },
//   "event_date": 1781571606,        // unix (segundos)
//   "triggerData": { ... }
// }

const VALID_STATUS = ["frio", "lista_espera", "quente", "convertido", "perdido"];

// Deduz o status do funil a partir do nome da etapa/tag.
function stageToStatus(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("ganhou") || s.includes("ganho")) return "convertido";
  if (s.includes("perdeu") || s.includes("perdido")) return "perdido";
  if (
    s.includes("quente") || s.includes("negocia") ||
    s.includes("follow") || s.includes("pagamento")
  ) {
    return "quente";
  }
  if (s.includes("espera")) return "lista_espera";
  return "frio";
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const expectedKey = process.env.UNNICHAT_WEBHOOK_KEY;
  const gotKey = req.nextUrl.searchParams.get("key");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = null;
  let rawText = "";
  try {
    rawText = await req.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }

  // Aceita o formato aninhado do Unnichat (body.contact.*) e também um
  // formato plano (body.contact_id) como fallback.
  const c = (body?.contact ?? {}) as Record<string, unknown>;
  const fields = (c.fields ?? {}) as Record<string, unknown>;
  const contactId = String(c.id ?? body?.contact_id ?? "");
  const name = (c.name ?? body?.name ?? null) as string | null;
  const email = (c.email ?? body?.email ?? null) as string | null;
  const phone = (c.phoneNumber ?? body?.phone ?? null) as string | null;
  const tags = (typeof c.tags === "string" ? c.tags : null) as string | null;
  // Etapa mais específica disponível: explícita > fields > tag > pipeline_stage.
  const stage =
    String(
      body?.etapa ??
        body?.triggerData?.etapa ??
        fields?.etapa ??
        fields?.estagio ??
        body?.pipeline_stage ??
        ""
    ) || null;
  const eventAt = body?.event_date
    ? new Date(Number(body.event_date) * 1000).toISOString()
    : new Date().toISOString();

  const keyOk = Boolean(expectedKey) && gotKey === expectedKey;

  // CAIXA-PRETA: registra TODA requisição (mesmo com chave inválida) para
  // diagnosticar a conexão com o Unnichat.
  if (supabase) {
    await supabase.from("webhook_log").insert({
      source: "unnichat",
      note: !expectedKey
        ? "server sem UNNICHAT_WEBHOOK_KEY"
        : !keyOk
          ? "chave inválida ou ausente"
          : contactId
            ? "evento"
            : "ping / sem contact_id",
      body: body ?? (rawText ? { _raw: rawText.slice(0, 2000) } : null),
    });
  }

  if (!expectedKey) {
    return NextResponse.json(
      { error: "UNNICHAT_WEBHOOK_KEY não configurada no servidor." },
      { status: 501 }
    );
  }
  if (!keyOk) {
    return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  }
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }
  if (!contactId) {
    return NextResponse.json({ ok: true, action: "ping" });
  }

  const status =
    typeof body?.status === "string" && VALID_STATUS.includes(body.status)
      ? body.status
      : stage
        ? stageToStatus(stage)
        : "frio";

  // Vendedor (se a automação mandar). Pode vir em seller/atendente.
  const sellerName = (body?.seller ?? fields?.atendente ?? null) as string | null;
  let sellerId: string | null = null;
  if (sellerName) {
    const { data: seller } = await supabase
      .from("sellers")
      .select("id")
      .ilike("name", String(sellerName))
      .maybeSingle();
    sellerId = seller?.id ?? null;
  }

  // 1) ESTADO ATUAL do lead (upsert). NÃO toca em extra (preserva tags/member
  // do Mailchimp); o payload completo fica no log de eventos abaixo.
  const row: Record<string, unknown> = {
    unnichat_id: contactId,
    updated_at: new Date().toISOString(),
  };
  if (name) row.name = name;
  if (email) row.email = email;
  if (phone) row.phone = phone;
  row.status = status;
  if (sellerId) row.seller_id = sellerId;
  if (body?.source) row.source = body.source;
  if (stage) row.pipeline_stage = stage;

  const { error: upErr } = await supabase
    .from("leads")
    .upsert(row, { onConflict: "unnichat_id" });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // 2) HISTÓRICO IMUTÁVEL: uma linha por evento, com o payload bruto completo.
  // É isso que permite medir conversão entre etapas e tempo-de-etapa.
  await supabase.from("lead_events").insert({
    unnichat_id: contactId,
    name,
    stage,
    status,
    tags,
    event_at: eventAt,
    raw: body,
  });

  return NextResponse.json({ ok: true });
}
