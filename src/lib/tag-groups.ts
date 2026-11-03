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
  /** leads criados por dia, por canal de origem (dia → canal → n) */
  origem: Record<string, Record<string, number>>;
  /** leads criados por dia com origem rastreada (alguma UTM) */
  rastreados: Record<string, number>;
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

export function agruparPorTags(
  leads: Lead[],
  origemDe: (l: Lead) => { canal: string; rastreado: boolean }
): PorTags {
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
      g = { tags: idx, leads: {}, mqls: {}, origem: {}, rastreados: {} };
      grupos.set(chave, g);
    }
    if (l.createdAt) {
      g.leads[l.createdAt] = (g.leads[l.createdAt] ?? 0) + 1;
      const { canal, rastreado } = origemDe(l);
      const dia = (g.origem[l.createdAt] ??= {});
      dia[canal] = (dia[canal] ?? 0) + 1;
      if (rastreado) g.rastreados[l.createdAt] = (g.rastreados[l.createdAt] ?? 0) + 1;
    }
    if (l.mqlAt) g.mqls[l.mqlAt] = (g.mqls[l.mqlAt] ?? 0) + 1;
  }
  return { tags, grupos: [...grupos.values()] };
}

/**
 * Contagem por dia sem os leads que têm alguma das tags tiradas. Lead sem tag
 * nenhuma sempre entra.
 */
function gruposQueEntram(porTags: PorTags, tiradas: ReadonlySet<string>): GrupoDeTags[] {
  const fora = new Set<number>();
  porTags.tags.forEach((t, i) => {
    if (tiradas.has(t)) fora.add(i);
  });
  return porTags.grupos.filter((g) => !g.tags.some((i) => fora.has(i)));
}

export function somarPorDia(
  porTags: PorTags,
  modo: "leads" | "mqls",
  tiradas: ReadonlySet<string>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of gruposQueEntram(porTags, tiradas)) {
    for (const [d, n] of Object.entries(g[modo])) out[d] = (out[d] ?? 0) + n;
  }
  return out;
}

/**
 * Origem dos leads criados entre `de` e `ate` (por canal) e quantos têm origem
 * rastreada, sem os leads que têm alguma das tags tiradas.
 */
export function somarOrigem(
  porTags: PorTags,
  tiradas: ReadonlySet<string>,
  de: string,
  ate: string
): { porCanal: Map<string, number>; total: number; rastreados: number } {
  const porCanal = new Map<string, number>();
  let total = 0;
  let rastreados = 0;
  for (const g of gruposQueEntram(porTags, tiradas)) {
    for (const [d, canais] of Object.entries(g.origem)) {
      if (d < de || d > ate) continue;
      for (const [ch, v] of Object.entries(canais)) {
        porCanal.set(ch, (porCanal.get(ch) ?? 0) + v);
        total += v;
      }
    }
    for (const [d, v] of Object.entries(g.rastreados)) if (d >= de && d <= ate) rastreados += v;
  }
  return { porCanal, total, rastreados };
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
