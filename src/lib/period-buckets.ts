// Agrupa contagens diárias (YYYY-MM-DD -> n) em dia / semana / mês / ano,
// cobrindo os últimos N períodos até hoje. Puro e sem dependências de servidor:
// roda no cliente, para o seletor de período trocar a visão sem recarregar.

export type Granularidade = "dia" | "semana" | "mes" | "ano";

export interface Bucket {
  label: string;   // eixo X (curto)
  titulo: string;  // tooltip (completo)
  valor: number;
  parcial: boolean; // período corrente, ainda correndo
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function parse(d: string): Date {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}

function iso(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

// Chave do período que contém o dia: o próprio dia, a segunda-feira da semana,
// o mês (YYYY-MM) ou o ano (YYYY).
function chave(d: string, g: Granularidade): string {
  if (g === "dia") return d;
  if (g === "mes") return d.slice(0, 7);
  if (g === "ano") return d.slice(0, 4);
  const dt = parse(d);
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return iso(dt);
}

// Chave do período `i` antes do corrente (i = 0 é o corrente).
function voltar(atual: string, g: Granularidade, i: number): string {
  if (g === "ano") return String(Number(atual) - i);
  if (g === "mes") {
    const [y, m] = atual.split("-").map(Number);
    return iso(new Date(Date.UTC(y, m - 1 - i, 1))).slice(0, 7);
  }
  const dt = parse(atual);
  dt.setUTCDate(dt.getUTCDate() - (g === "semana" ? 7 : 1) * i);
  return iso(dt);
}

function rotulos(k: string, g: Granularidade): { label: string; titulo: string } {
  if (g === "ano") return { label: k, titulo: k };
  if (g === "mes") {
    const nome = `${MESES[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}`;
    return { label: nome, titulo: nome };
  }
  const curto = `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  const completo = `${curto}/${k.slice(2, 4)}`;
  return g === "semana"
    ? { label: curto, titulo: `semana de ${completo}` }
    : { label: curto, titulo: completo };
}

// Primeiro e último dia (YYYY-MM-DD) do período de uma chave.
function inicioDaChave(k: string, g: Granularidade): string {
  if (g === "mes") return `${k}-01`;
  if (g === "ano") return `${k}-01-01`;
  return k; // dia, ou a segunda-feira da semana
}
function fimDaChave(k: string, g: Granularidade): string {
  if (g === "dia") return k;
  if (g === "ano") return `${k}-12-31`;
  if (g === "semana") return voltar(k, "dia", -6);
  const [y, m] = k.split("-").map(Number);
  return iso(new Date(Date.UTC(y, m, 0)));
}

/** Datas que a janela "últimos N períodos até hoje" cobre (início do 1º período → hoje). */
export function intervaloDaJanela(
  hoje: string,
  g: Granularidade,
  n: number
): { de: string; ate: string } {
  return { de: inicioDaChave(voltar(chave(hoje, g), g, Math.max(1, n) - 1), g), ate: hoje };
}

/**
 * Agrupa só os dias dentro de [de, ate]. Os períodos das pontas que ficam
 * cortados pelo intervalo (ou que ainda estão correndo) saem como parciais.
 */
export function agruparIntervalo(
  porDia: Record<string, number>,
  de: string,
  ate: string,
  g: Granularidade,
  hoje: string
): Bucket[] {
  const soma = new Map<string, number>();
  for (const [d, v] of Object.entries(porDia)) {
    if (d < de || d > ate) continue;
    const k = chave(d, g);
    soma.set(k, (soma.get(k) ?? 0) + v);
  }
  const atual = chave(hoje, g);
  const fim = chave(ate, g);
  const out: Bucket[] = [];
  // teto de segurança: ~10 anos de dias
  for (let k = chave(de, g), i = 0; k <= fim && i < 4000; k = voltar(k, g, -1), i++) {
    out.push({
      ...rotulos(k, g),
      valor: soma.get(k) ?? 0,
      parcial: k === atual || inicioDaChave(k, g) < de || fimDaChave(k, g) > ate,
    });
  }
  return out;
}

/** Soma os dias dentro de [de, ate]. */
export function somarIntervalo(porDia: Record<string, number>, de: string, ate: string): number {
  let t = 0;
  for (const [d, v] of Object.entries(porDia)) if (d >= de && d <= ate) t += v;
  return t;
}

export function agrupar(
  porDia: Record<string, number>,
  hoje: string,
  g: Granularidade,
  n: number
): Bucket[] {
  const soma = new Map<string, number>();
  for (const [d, v] of Object.entries(porDia)) {
    const k = chave(d, g);
    soma.set(k, (soma.get(k) ?? 0) + v);
  }
  const atual = chave(hoje, g);
  const out: Bucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = voltar(atual, g, i);
    out.push({ ...rotulos(k, g), valor: soma.get(k) ?? 0, parcial: i === 0 });
  }
  return out;
}
