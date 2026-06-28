// Extrai as UTMs de origem dos merge fields do Mailchimp.
//
// Os formulários das landing pages gravam a origem do lead em merge fields
// (descobertos pela leitura da audiência): utm_source, utm_medium,
// utm_campaign, utm_content, utm_term e o vidorigem (id/nome do vídeo ou
// podcast que trouxe a pessoa). Os nomes "humanos" (ex.: "utm_source") são
// estáveis; as TAGS internas (MMERGE12...) não são, então mapeamos pelo NOME
// vindo do schema da audiência em vez de chumbar MMERGE12.

import type { LeadUtm } from "./types";

// Valor "vazio" de verdade: nulo, string em branco, "0" ou placeholder de
// template não preenchido ({{site_source_name}}, {{campaign.name}}...).
function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = (typeof v === "string" ? v : String(v)).trim();
  if (s === "" || s === "0") return null;
  if (s.includes("{{") || s.includes("}}")) return null;
  return s.slice(0, 200);
}

// schema: tag interna -> nome humano do merge field (ex.: MMERGE12 -> utm_source).
// mergeFields: o objeto members.merge_fields de um contato (tag -> valor).
export function extractUtm(
  mergeFields: Record<string, unknown> | null | undefined,
  schema: Map<string, string>
): LeadUtm | null {
  if (!mergeFields) return null;
  const utm: LeadUtm = {};
  for (const [tag, raw] of Object.entries(mergeFields)) {
    const name = (schema.get(tag) ?? tag).toLowerCase().trim();
    const val = clean(raw);
    if (val == null) continue;
    if (name.includes("utm_source")) utm.source = val;
    else if (name.includes("utm_medium")) utm.medium = val;
    else if (name.includes("utm_campaign")) utm.campaign = val;
    else if (name.includes("utm_content")) utm.content = val;
    else if (name.includes("utm_term")) utm.term = val;
    else if (name === "vidorigem" || tag === "VIDORIGEM") utm.vidorigem = val;
  }
  return Object.keys(utm).length > 0 ? utm : null;
}
