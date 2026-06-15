import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isSalesTeamTag } from "@/lib/leads";

// Webhook do Unnichat (CRM/atendimento).
// Configure uma automação no Unnichat (Requisição HTTP) para chamar
// https://SEU_DOMINIO/api/webhooks/unnichat?key=UNNICHAT_WEBHOOK_KEY
// quando o contato interagir, mudar de etapa ou for atribuído a um atendente.
//
// Formato REAL enviado pelo Unnichat (os dados vêm aninhados em "contact"):
// {
//   "contact": {
//     "id": "uuid", "name": "Fulano", "phoneNumber": "5511...",
//     "email": "...", "tags": "lista-de-espera, lead-frio",
//     "fields": { "estagio": "lista_espera", "faturamento": "...", ... }
//   },
//   "event_date": 1781557851,
//   "triggerData": { ... }   // dados do gatilho (ex.: etapa, atendente)
// }

const VALID_STATUS = ["frio", "lista_espera", "quente", "convertido", "perdido"];

// Deduz o status do funil a partir do nome da etapa do CRM.
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

  // Lê o corpo cru (pings de validação podem vir vazios).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = null;
  let rawText = "";
  try {
    rawText = await req.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }
  // O contato vem aninhado em "contact"; toleramos formato plano (legado).
  const contact = body?.contact && typeof body.contact === "object" ? body.contact : body;
  const contactId = contact ? String(contact.id ?? contact.contact_id ?? "") : "";
  const keyOk = Boolean(expectedKey) && gotKey === expectedKey;

  // CAIXA-PRETA: registra TODA requisição recebida — inclusive com chave
  // inválida/ausente — para diagnosticar a conexão com o Unnichat.
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

  // ---- Normaliza os campos do contato real do Unnichat ----
  const name = contact.name || null;
  const phone = contact.phoneNumber ?? contact.phone ?? null;
  const email = contact.email || null;
  const fields =
    contact.fields && typeof contact.fields === "object" ? contact.fields : {};

  // Tags vêm como string "a, b, c" (ou array).
  const tagsRaw = contact.tags ?? body.tags;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw.map(String)
    : String(tagsRaw ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

  // Atendente/vendedor: do gatilho (atribuição) ou de um campo direto.
  const seller =
    body.seller ?? contact.seller ?? body.triggerData?.attendant ?? body.triggerData?.seller ?? null;

  // Etapa do CRM: do gatilho de pipeline (quando houver).
  const pipelineStage =
    body.pipeline_stage ?? body.triggerData?.pipeline_stage ?? body.triggerData?.stage ?? null;

  // Extra: campos customizados do contato + tags.
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== "" && v !== "-") extra[k] = v;
  }
  if (tags.length > 0) extra.tags = tags;

  // Status: explícito (legado) > tag de time de vendas > etapa/estágio.
  let newStatus: string | null = null;
  if (VALID_STATUS.includes(String(body.status))) newStatus = String(body.status);
  else if (tags.some(isSalesTeamTag)) newStatus = "lista_espera";
  else if (pipelineStage) newStatus = stageToStatus(String(pipelineStage));
  else if (typeof fields.estagio === "string" && fields.estagio) {
    newStatus = stageToStatus(fields.estagio);
  }

  let sellerId: string | null = null;
  if (seller) {
    const { data: s } = await supabase
      .from("sellers")
      .select("id")
      .ilike("name", String(seller))
      .maybeSingle();
    sellerId = s?.id ?? null;
    if (!sellerId) extra.atendente = String(seller);
  }

  // Atualização parcial: cada automação manda um pedaço; só sobrescreve o que
  // veio preenchido, para uma automação não apagar dados da outra.
  const row: Record<string, unknown> = {
    unnichat_id: contactId,
    updated_at: new Date().toISOString(),
  };
  if (name) row.name = name;
  if (email) row.email = email;
  if (phone) row.phone = String(phone);
  if (newStatus) row.status = newStatus;
  if (sellerId) row.seller_id = sellerId;
  if (pipelineStage) row.pipeline_stage = String(pipelineStage);
  if (Object.keys(extra).length > 0) row.extra = extra;

  const { error } = await supabase.from("leads").upsert(row, { onConflict: "unnichat_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
