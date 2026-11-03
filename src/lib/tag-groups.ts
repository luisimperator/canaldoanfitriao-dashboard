// Leads e MQLs por dia, agrupados pelo conjunto de tags do lead. O gráfico de
// MQLs troca MQLs ↔ Leads e tira tags (ex.: as da Black) no navegador sem
// receber os ~50 mil leads: o servidor manda um grupo por combinação de tags,
// com as contagens por dia.

import type { Lead } from "./types";

export interface GrupoDeTags {
  /** índices em `tags` de PorTags, em ordem crescente */
  tags: number[];
  /** leads criados por dia (createdAt) */
  leads: Record<string, number>;
  /** MQLs por dia (mqlAt) */
  mqls: Record<string, number>;
}

export interface PorTags {
  /** nomes das tags, em minúsculas */
  tags: string[];
  grupos: GrupoDeTags[];
}

export function tagsDoLead(l: Lead): string[] {
  const bruto = l.extra && typeof l.extra === "object" ? (l.extra as Record<string, unknown>).tags : null;
  if (!Array.isArray(bruto)) return [];
  return Array.from(new Set(bruto.map((t) => String(t).trim().toLowerCase()).filter(Boolean)));
}

export function agruparPorTags(leads: Lead[]): PorTags {
  const tags: string[] = [];
  const indice = new Map<string, number>();
  const grupos = new Map<string, GrupoDeTags>();
  for (const l of leads) {
    const idx = tagsDoLead(l)
      .map((t) => {
        let i = indice.get(t);
        if (i === undefined) {
          i = tags.length;
          tags.push(t);
          indice.set(t, i);
        }
        return i;
      })
      .sort((a, b) => a - b);
    const chave = idx.join(",");
    let g = grupos.get(chave);
    if (!g) {
      g = { tags: idx, leads: {}, mqls: {} };
      grupos.set(chave, g);
    }
    if (l.createdAt) g.leads[l.createdAt] = (g.leads[l.createdAt] ?? 0) + 1;
    if (l.mqlAt) g.mqls[l.mqlAt] = (g.mqls[l.mqlAt] ?? 0) + 1;
  }
  return { tags, grupos: [...grupos.values()] };
}

/**
 * Contagem por dia sem os leads que têm alguma das tags tiradas. Lead sem tag
 * nenhuma sempre entra.
 */
export function somarPorDia(
  porTags: PorTags,
  modo: "leads" | "mqls",
  tiradas: ReadonlySet<string>
): Record<string, number> {
  const fora = new Set<number>();
  porTags.tags.forEach((t, i) => {
    if (tiradas.has(t)) fora.add(i);
  });
  const out: Record<string, number> = {};
  for (const g of porTags.grupos) {
    if (g.tags.some((i) => fora.has(i))) continue;
    for (const [d, n] of Object.entries(g[modo])) out[d] = (out[d] ?? 0) + n;
  }
  return out;
}

/** Quantos leads (ou MQLs) de cada tag caem entre `de` e `ate`. */
export function contarTags(
  porTags: PorTags,
  modo: "leads" | "mqls",
  de: string,
  ate: string
): number[] {
  const out = porTags.tags.map(() => 0);
  for (const g of porTags.grupos) {
    let n = 0;
    for (const [d, v] of Object.entries(g[modo])) if (d >= de && d <= ate) n += v;
    if (n === 0) continue;
    for (const i of g.tags) out[i] += n;
  }
  return out;
}
