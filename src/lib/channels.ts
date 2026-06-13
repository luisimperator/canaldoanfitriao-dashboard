// Classificação de canal de origem a partir das UTMs da venda (Eduzz).
// Heurística baseada na análise do histórico do Canal do Anfitrião:
// as UTMs são uma sopa de campanhas pagas, posts orgânicos, links de
// vendedores, grupos de WhatsApp e e-mail. Aqui a gente normaliza isso
// em poucos canais legíveis. É aproximação, não ciência exata.

export type Channel =
  | "Tráfego pago (Meta)"
  | "Vendedores"
  | "Instagram orgânico"
  | "WhatsApp"
  | "E-mail"
  | "Orgânico / Direto"
  | "Outro (rastreado)"
  | "Sem rastreio";

export const CHANNEL_ORDER: Channel[] = [
  "Tráfego pago (Meta)",
  "Vendedores",
  "Instagram orgânico",
  "WhatsApp",
  "E-mail",
  "Orgânico / Direto",
  "Outro (rastreado)",
  "Sem rastreio",
];

export const CHANNEL_COLOR: Record<Channel, string> = {
  "Tráfego pago (Meta)": "#e11d48",
  Vendedores: "#0ea5e9",
  "Instagram orgânico": "#8b5cf6",
  WhatsApp: "#10b981",
  "E-mail": "#f59e0b",
  "Orgânico / Direto": "#64748b",
  "Outro (rastreado)": "#94a3b8",
  "Sem rastreio": "#cbd5e1",
};

const SELLER_SOURCES = ["diego", "flavio", "flávio", "tony", "antonio"];

interface Utm {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
}

export function classifyChannel(utm: Utm | null | undefined): Channel {
  if (!utm) return "Sem rastreio";
  const s = (utm.source ?? "").toLowerCase().trim();
  const m = (utm.medium ?? "").toLowerCase().trim();
  const c = (utm.campaign ?? "").toLowerCase().trim();
  if (!s && !m && !c) return "Sem rastreio";

  const blob = `${s} ${m} ${c}`;

  // 1. Tráfego pago (Meta): sinais de campanha paga no medium ou na fonte.
  if (
    /\bfb_|advantage|lookalike|interesses?|\brmkt\b|\[lf\]|\[launch\]|\bcbo\b|\bllk\b|placement|seguidores|tr[aá]fego|\bpaid\b/.test(
      blob
    ) ||
    /^gig-|fb_facebook/.test(s)
  ) {
    return "Tráfego pago (Meta)";
  }

  // 2. Vendedores (links individuais; sempre sem medium).
  if (SELLER_SOURCES.some((n) => s === n || s.startsWith(n + " ") || s.startsWith(n + "_"))) {
    return "Vendedores";
  }

  // 3. WhatsApp.
  if (/whatsapp|\bwpp\b|grupos-?whats|\bgrupos\b/.test(blob)) return "WhatsApp";

  // 4. E-mail.
  if (/e-?mail|eduzz_rvp/.test(blob)) return "E-mail";

  // 5. Instagram orgânico / influência (Rômulo).
  if (/instagram|\big_|^ig$|\big\b|story|insta|romulo|r[oô]mulo|\bsuri\b/.test(blob)) {
    return "Instagram orgânico";
  }

  // 6. Orgânico / direto.
  if (/org[aâ]nico|organic|direto|direct|dominio|link.?bio|\bbio\b/.test(blob)) {
    return "Orgânico / Direto";
  }

  return "Outro (rastreado)";
}
