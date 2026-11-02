import type { SupabaseClient } from "@supabase/supabase-js";
import { isSalesTeamTag } from "@/lib/leads";
import { utmFromFields } from "@/lib/mailchimp-utm";

// Processa UM aviso do Unnichat: atualiza o estado do lead (leads) e grava o
// evento no histórico (lead_events). Roda na fila (/api/sync/unnichat-fila),
// não mais dentro da requisição do webhook.
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

export interface Vendedor {
  id: string;
  name: string;
}

export type ResultadoEvento = { ok: true } | { ok: false; erro: string };

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

/** id do contato do Unnichat no aviso ("" se não tiver) */
export function contatoDoAviso(body: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as any;
  const contact = b?.contact && typeof b.contact === "object" ? b.contact : b;
  return contact ? String(contact.id ?? contact.contact_id ?? "") : "";
}

export async function processarEventoUnnichat(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  opts: {
    /** ?etapa=<nome> da URL que a automação do Unnichat chamou */
    etapa: string | null;
    /** quando o aviso chegou (data do evento se o Unnichat não mandar) */
    recebidoEm: string;
    /** vendedores (carregados uma vez por lote) */
    vendedores: Vendedor[];
    /** última tentativa: grava o evento no histórico mesmo se o lead falhar */
    ultimaTentativa?: boolean;
  }
): Promise<ResultadoEvento> {
  // O contato vem aninhado em "contact"; toleramos formato plano (legado).
  const contact = body?.contact && typeof body.contact === "object" ? body.contact : body;
  const contactId = contatoDoAviso(body);
  if (!contactId) return { ok: true };

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
  // etapa chamar a URL com ?etapa=<nome> — gravado junto com o aviso na fila.
  const pipelineStage =
    body.pipeline_stage ?? body.triggerData?.pipeline_stage ?? body.triggerData?.stage ?? null;
  const stage = opts.etapa
    ? opts.etapa
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
    const wanted = normName(String(seller));
    sellerId = opts.vendedores.find((s) => normName(s.name) === wanted)?.id ?? null;
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

  // Antes de gravar: se essa pessoa já está na base pelo e-mail (entrou pelo
  // Mailchimp), cola o contato do Unnichat NELA. Sem isso o upsert abaixo não
  // acha por unnichat_id e cria uma segunda linha para a mesma pessoa — era o
  // caminho normal de quem entra na lista de espera e depois fala no WhatsApp,
  // e rendeu 873 duplicatas antes da 0046 fechar o buraco.
  if (email) {
    await supabase.rpc("claim_lead_for_unnichat", {
      p_email: email,
      p_unnichat_id: contactId,
    });
  }

  // A mesma pessoa pode ter DOIS contatos no Unnichat (ex.: WhatsApp e
  // Instagram) com o mesmo e-mail. Como leads.email é único, gravar o segundo
  // contato batia no índice leads_email_unico e o evento se perdia. Agora:
  //  - contato que já tem lead: atualiza o lead dele, sem trocar o e-mail por
  //    um que já é de outro lead;
  //  - contato sem lead, com e-mail de um lead existente: atualiza esse lead e
  //    grava o evento nele (o id original do contato fica no raw do evento).
  const emailNorm = email ? String(email).trim().toLowerCase() : null;
  const { data: proprio, error: errProprio } = await supabase
    .from("leads")
    .select("id")
    .eq("unnichat_id", contactId)
    .maybeSingle();
  if (errProprio) return { ok: false, erro: errProprio.message };
  const { data: donoDoEmail } = emailNorm
    ? await supabase
        .from("leads")
        .select("id, unnichat_id, name, phone, extra")
        .eq("email", emailNorm)
        .maybeSingle()
    : { data: null };

  let eventKey = contactId;
  let writeErr: string | null = null;
  if (!proprio && donoDoEmail) {
    const upd: Record<string, unknown> = { ...row };
    delete upd.unnichat_id;
    delete upd.email;
    if (donoDoEmail.unnichat_id) eventKey = donoDoEmail.unnichat_id;
    else upd.unnichat_id = contactId;
    // Nome, telefone e campos do lead que já existe não são apagados pelo
    // segundo contato: só completa o que falta.
    if (donoDoEmail.name) delete upd.name;
    if (donoDoEmail.phone) delete upd.phone;
    if (upd.extra) {
      upd.extra = { ...((donoDoEmail.extra as Record<string, unknown> | null) ?? {}), ...extra };
    }
    const { error } = await supabase.from("leads").update(upd).eq("id", donoDoEmail.id);
    if (error) writeErr = error.message;
  } else {
    if (proprio && donoDoEmail && donoDoEmail.id !== proprio.id) delete row.email;
    const { error } = await supabase.from("leads").upsert(row, { onConflict: "unnichat_id" });
    if (error) writeErr = error.message;
  }
  // Falhou o lead: a fila tenta de novo mais tarde (sem gravar o evento agora,
  // senão ele duplicaria na nova tentativa). Na última, grava o evento assim
  // mesmo — o histórico nunca deve se perder.
  if (writeErr && !opts.ultimaTentativa) return { ok: false, erro: writeErr };

  // 2) HISTÓRICO IMUTÁVEL: uma linha por evento, com o payload bruto completo.
  // É isso que permite medir conversão entre etapas e tempo-de-etapa.
  const eventAt = body.event_date
    ? new Date(Number(body.event_date) * 1000).toISOString()
    : opts.recebidoEm;
  const { error: evErr } = await supabase.from("lead_events").insert({
    unnichat_id: eventKey,
    name,
    stage,
    status: newStatus,
    seller,
    tags: tags.length > 0 ? tags.join(", ") : null,
    event_at: eventAt,
    raw: body,
  });
  if (evErr) return { ok: false, erro: evErr.message };
  if (writeErr) return { ok: false, erro: writeErr };

  return { ok: true };
}
