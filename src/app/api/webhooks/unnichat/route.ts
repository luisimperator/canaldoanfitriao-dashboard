import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isSalesTeamTag } from "@/lib/leads";
import { utmFromFields } from "@/lib/mailchimp-utm";

// Webhook do Unnichat (CRM/atendimento).
// As automações do Unnichat (Requisição HTTP) chamam:
//   https://SEU_DOMINIO/api/webhooks/unnichat?key=UNNICHAT_WEBHOOK_KEY
// nos eventos: contato criado, mudança de etapa do pipeline, ganho/perdido.
//
// Formato REAL enviado pelo Unnichat (os dados vêm aninhados em "contact"):
// {
//   "contact": {
//     "id": "uuid", "name": "Fulano", "phoneNumber": "5511...",
//     "email": "...", "tags": "lista-de-espera, lead-frio",
//     "fields": { "estagio": "lista_espera", ... }
//   },
//   "event_date": 1781557851,        // unix (segundos)
//   "triggerData": { ... }           // dados do gatilho (ex.: etapa, atendente)
// }

const VALID_STATUS = ["frio", "lista_espera", "quente", "convertido", "perdido"];

// Nome de pessoa normalizado para comparação: colapsa espaços repetidos
// ("Diego  Henrique" ≠ "Diego Henrique" no match exato — 143 leads ficaram
// sem vendedor por causa disso), tira acentos e baixa a caixa.
function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Valores do Flow de qualificação às vezes chegam com o ID da opção prefixado
// ("3_Ainda não comecei a alugar"). Sem limpar, a segmentação por faixa quebra.
function cleanFieldValue(v: unknown): unknown {
  return typeof v === "string" ? v.replace(/^\d+_/, "") : v;
}

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
  if (!body || !contactId) {
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

  // Atendente/vendedor: o webhook NÃO manda. Buscamos na API do Unnichat
  // (atendente atual do contato) e carimbamos no evento — é a base da taxa
  // de fechamento por vendedor. Tolerante a falha (mantém null).
  let seller: string | null =
    body.seller ?? contact.seller ?? body.triggerData?.attendant ?? body.triggerData?.seller ?? null;
  try {
    const { data: assignee } = await supabase.rpc("unnichat_assignee", { p_contact: contactId });
    if (typeof assignee === "string" && assignee) seller = assignee;
  } catch {
    /* mantém o que veio (ou null) */
  }

  // Etapa do CRM. O Unnichat NÃO manda a etapa específica em lugar nenhum
  // (nem no body, nem na API). A forma de capturá-la é a automação de cada
  // etapa chamar a URL com ?etapa=<nome> — lido aqui com prioridade máxima.
  const etapaFromUrl = req.nextUrl.searchParams.get("etapa");
  const pipelineStage =
    body.pipeline_stage ?? body.triggerData?.pipeline_stage ?? body.triggerData?.stage ?? null;
  const stage = etapaFromUrl
    ? etapaFromUrl
    : pipelineStage
      ? String(pipelineStage)
      : typeof fields.estagio === "string" && fields.estagio
        ? fields.estagio
        : null;

  // Extra: campos customizados do contato + tags.
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== "" && v !== "-") extra[k] = cleanFieldValue(v);
  }
  // O Flow grava o tipo de imóvel em "tipo-imovel" (hífen), mas parte das
  // análises espera "tipo_imovel" (underscore). Espelha no nome canônico.
  if (extra["tipo-imovel"] != null && extra["tipo_imovel"] == null) {
    extra["tipo_imovel"] = extra["tipo-imovel"];
  }
  if (tags.length > 0) extra.tags = tags;
  // Origem do lead: se a LP/automação mandar utm_* / vidorigem como campos
  // customizados, monta o objeto utm que a página de Origem lê (extra.utm).
  const utm = utmFromFields(fields);
  if (utm) extra.utm = utm;

  // Status: explícito (legado) > tag de time de vendas > etapa/estágio.
  let newStatus: string | null = null;
  if (VALID_STATUS.includes(String(body.status))) newStatus = String(body.status);
  else if (tags.some(isSalesTeamTag)) newStatus = "lista_espera";
  else if (stage) newStatus = stageToStatus(stage);

  let sellerId: string | null = null;
  if (seller) {
    // Compara nomes NORMALIZADOS (espaços colapsados, sem acento) — o match
    // exato via ilike falhava com "Diego  Henrique" (espaço duplo do Unnichat).
    const { data: allSellers } = await supabase.from("sellers").select("id, name");
    const wanted = normName(String(seller));
    sellerId = (allSellers ?? []).find((s) => normName(s.name) === wanted)?.id ?? null;
    if (!sellerId) extra.atendente = String(seller);
  }

  // 1) ESTADO ATUAL do lead (upsert parcial): cada automação manda um pedaço;
  // só sobrescreve o que veio preenchido, para uma automação não apagar a outra.
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

  const { error: upErr } = await supabase
    .from("leads")
    .upsert(row, { onConflict: "unnichat_id" });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // 2) HISTÓRICO IMUTÁVEL: uma linha por evento, com o payload bruto completo.
  // É isso que permite medir conversão entre etapas e tempo-de-etapa.
  const eventAt = body.event_date
    ? new Date(Number(body.event_date) * 1000).toISOString()
    : new Date().toISOString();
  await supabase.from("lead_events").insert({
    unnichat_id: contactId,
    name,
    stage,
    status: newStatus,
    seller,
    tags: tags.length > 0 ? tags.join(", ") : null,
    event_at: eventAt,
    raw: body,
  });

  return NextResponse.json({ ok: true });
}
