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

// Deduz o status do funil a partir do nome da etapa do CRM, para a
// automação de etapa não precisar enviar status explícito.
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
  const contactId = body ? String(body.contact_id ?? "") : "";
  const keyOk = Boolean(expectedKey) && gotKey === expectedKey;

  // CAIXA-PRETA: registra TODA requisição recebida — inclusive com chave
  // inválida/ausente — para conseguir diagnosticar a conexão com o Unnichat.
  // Antes, chamadas com chave errada eram rejeitadas sem deixar rastro, então
  // não dava para saber se o Unnichat estava chamando a URL (e como).
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

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  // Diagnóstico: registra TODA requisição que chega — mesmo com chave errada —
  // para sabermos se as automações do Unnichat estão de fato disparando.
  const keyParam = req.nextUrl.searchParams.get("key");
  const keyOk = keyParam === expectedKey;
  let body;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  await supabase.from("webhook_log").insert({
    source: "unnichat",
    note: keyOk
      ? body
        ? String(body.contact_id ?? "") ? "evento (key ok)" : "ping sem contact_id (key ok)"
        : "corpo ausente (key ok)"
      : `key invalida: ${keyParam ?? "ausente"}`,
    body,
  });

  if (!keyOk) {
    return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  }
  if (!body) {
    return NextResponse.json({ ok: true, action: "ping" });
  }
  const contactId = String(body.contact_id ?? "");
  if (!contactId) {
    return NextResponse.json({ ok: true, action: "ping" });
  }
  const status = VALID_STATUS.includes(body.status) ? body.status : "frio";

  // Campos além dos conhecidos (produto, tipo, numero-imoveis...)
  // são preservados em leads.extra.
  const known = new Set([
    "contact_id", "name", "email", "phone", "status", "seller", "source", "pipeline_stage",
  ]);
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!known.has(k) && v !== null && v !== "") extra[k] = v;
  }

  let sellerId: string | null = null;
  if (body.seller) {
    const { data: seller } = await supabase
      .from("sellers")
      .select("id")
      .ilike("name", String(body.seller))
      .maybeSingle();
    sellerId = seller?.id ?? null;
    // Atendente que não é vendedor cadastrado fica registrado mesmo assim
    if (!sellerId) extra.atendente = String(body.seller);
  }

  // Atualização parcial: automações diferentes mandam pedaços diferentes
  // (criação, mudança de etapa, atribuição a vendedor). Só sobrescreve o
  // que veio preenchido, para uma automação não apagar dados da outra.
  const row: Record<string, unknown> = {
    unnichat_id: contactId,
    updated_at: new Date().toISOString(),
  };
  if (body.name) row.name = body.name;
  if (body.email) row.email = body.email;
  if (body.phone) row.phone = body.phone;
  if (VALID_STATUS.includes(body.status)) row.status = status;
  else if (body.pipeline_stage) row.status = stageToStatus(String(body.pipeline_stage));
  if (sellerId) row.seller_id = sellerId;
  if (body.source) row.source = body.source;
  if (body.pipeline_stage) row.pipeline_stage = String(body.pipeline_stage);
  if (Object.keys(extra).length > 0) row.extra = extra;

  const { error } = await supabase.from("leads").upsert(row, { onConflict: "unnichat_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
