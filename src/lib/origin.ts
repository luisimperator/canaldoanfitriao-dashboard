// Análise de ORIGEM DOS LEADS: de onde vêm os leads e qual a qualidade de cada
// origem. A origem (utm_* + vidorigem) vem do Mailchimp, gravada pela landing
// page; o sync (api/sync/mailchimp) grava em lead.utm.
//
// "Qualidade" aqui = virou MQL. MQL = lead que virou quente e foi atribuído a
// um vendedor (mesma definição do resto do painel: seller_id preenchido). A
// taxa de qualificação (MQL ÷ leads) diz quanto cada origem gera de lead que
// REALMENTE interessa, não só volume.

import type { Lead } from "./types";
import { classifyChannel, type Channel } from "./channels";

export function isMql(l: Lead): boolean {
  return l.sellerId != null;
}

export function hasUtm(l: Lead): boolean {
  const u = l.utm;
  return Boolean(u && (u.source || u.medium || u.campaign || u.content || u.term || u.vidorigem));
}

export function leadTags(l: Lead): string[] {
  const t = l.extra && typeof l.extra === "object" ? (l.extra as Record<string, unknown>).tags : null;
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : [];
}

// Uma tag só conta como ORIGEM (campanha/LP/evento de entrada) se não for
// etapa de funil do CRM nem carimbo de integração. As tags de funil vêm do
// Unnichat (1 tentativa contato, lead-quente, EM RECUPERACAO...) e não dizem
// de onde a pessoa veio; as de integração (Produto Digital, QuickBooks
// Customer, Conta Azul) são ruído. Sem esse filtro o card vira sopa.
const TAG_FUNNEL = [
  /tentativa/,
  /n[ãa]o.?respondeu/,
  /respondeu.?pesquisa/,
  /recupera/,
  /^lead[-\s]?(quente|frio|morno)$/,
  /^em\s/,
  /negocia/,
  /agendad/,
  /no.?show/,
  /follow.?up/,
  /ganho|ganhou/,
  /^perdid/,
  /atendid/,
];
const TAG_NOISE = new Set([
  "produto digital",
  "aluno-geral",
  "aluno geral",
  "quickbooks customer",
  "conta azul",
  "cliente",
]);

export function isOriginTag(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  if (!t) return false;
  if (TAG_NOISE.has(t)) return false;
  return !TAG_FUNNEL.some((re) => re.test(t));
}

export interface OriginRow {
  key: string;
  leads: number;
  mql: number;
  rate: number; // mql / leads
}

export interface ChannelRow {
  channel: Channel;
  leads: number;
  mql: number;
  rate: number;
}

export interface LeadOrigin {
  totalLeads: number;
  tracked: number;
  trackedPct: number;
  /** MQLs entre os leads rastreados */
  trackedMql: number;
  byChannel: ChannelRow[];
  byContent: OriginRow[];
  byVideo: OriginRow[];
  bySource: OriginRow[];
}

// Top-N origens por um extrator de chave, contando leads e MQLs.
function rank(leads: Lead[], keyOf: (l: Lead) => string | null, limit = 12): OriginRow[] {
  const map = new Map<string, { leads: number; mql: number }>();
  for (const l of leads) {
    const k = keyOf(l);
    if (!k) continue;
    const e = map.get(k) ?? { leads: 0, mql: 0 };
    e.leads += 1;
    if (isMql(l)) e.mql += 1;
    map.set(k, e);
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, leads: v.leads, mql: v.mql, rate: v.leads ? v.mql / v.leads : 0 }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, limit);
}

// Origem por TAG de campanha — cobre quase toda a base (mesmo quem não tem
// UTM, tem tag do Mailchimp dizendo o lançamento/LP de entrada). Uma lead pode
// ter mais de uma tag, então a soma das linhas passa do nº de leads; por isso
// devolvemos `covered` (quantas leads têm ao menos uma tag de campanha).
export interface TagOrigin {
  rows: OriginRow[];
  covered: number;
  coveredPct: number;
}

export function tagOrigin(leads: Lead[], limit = 20): TagOrigin {
  const map = new Map<string, { leads: number; mql: number }>();
  let covered = 0;
  for (const l of leads) {
    // normaliza caixa pra "Lista-de-Espera" e "lista-de-espera" não virarem
    // duas linhas; só tags de origem (sem funil/ruído).
    const tags = [...new Set(leadTags(l).map((t) => t.trim().toLowerCase()).filter(isOriginTag))];
    if (tags.length) covered += 1;
    const mql = isMql(l);
    for (const t of tags) {
      const e = map.get(t) ?? { leads: 0, mql: 0 };
      e.leads += 1;
      if (mql) e.mql += 1;
      map.set(t, e);
    }
  }
  const rows = [...map.entries()]
    .map(([key, v]) => ({ key, leads: v.leads, mql: v.mql, rate: v.leads ? v.mql / v.leads : 0 }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, limit);
  return { rows, covered, coveredPct: leads.length ? (covered / leads.length) * 100 : 0 };
}

export function leadOrigin(leads: Lead[]): LeadOrigin {
  const totalLeads = leads.length;
  const trackedLeads = leads.filter(hasUtm);
  const tracked = trackedLeads.length;

  // Canal: calculado só sobre os leads rastreados, pra proporção fazer sentido.
  const chMap = new Map<Channel, { leads: number; mql: number }>();
  for (const l of trackedLeads) {
    const ch = classifyChannel(l.utm);
    const e = chMap.get(ch) ?? { leads: 0, mql: 0 };
    e.leads += 1;
    if (isMql(l)) e.mql += 1;
    chMap.set(ch, e);
  }
  const byChannel: ChannelRow[] = [...chMap.entries()]
    .map(([channel, v]) => ({ channel, leads: v.leads, mql: v.mql, rate: v.leads ? v.mql / v.leads : 0 }))
    .sort((a, b) => b.leads - a.leads);

  const trackedMql = trackedLeads.filter(isMql).length;

  return {
    totalLeads,
    tracked,
    trackedPct: totalLeads ? (tracked / totalLeads) * 100 : 0,
    trackedMql,
    byChannel,
    byContent: rank(trackedLeads, (l) => l.utm?.content?.trim() || null),
    byVideo: rank(trackedLeads, (l) => l.utm?.vidorigem?.trim() || null),
    bySource: rank(trackedLeads, (l) => l.utm?.source?.trim() || null),
  };
}
