// Custo do WhatsApp (API oficial): tipos e contas do painel /custos/whatsapp.
// Os números vêm da própria Meta (migração 0148: pricing_analytics por conta e
// template_analytics por modelo); aqui só agrupa pra tela.

export interface ContaWa {
  waba_id: string;
  nome: string | null;
  numero: string | null;
  moeda: string | null;
}

export interface DiaWa {
  dia: string;
  waba_id: string;
  categoria: string;
  tipo: string;
  volume: number;
  custo: number;
  custo_brl: number;
}

export interface ModeloWa {
  waba_id: string;
  template_id: string;
  nome: string;
  categoria: string | null;
  origem: string;
  enviados: number;
  entregues: number;
  lidos: number;
  cliques: number;
  custo: number;
  custo_brl: number;
}

export interface PainelWa {
  contas: ContaWa[];
  dias: DiaWa[];
  modelos: ModeloWa[];
  cambio_hoje: { dia: string; venda: number } | null;
  atualizado_em: string | null;
  ultima_sync: { em: string; note: string; erros: string[] | null } | null;
}

// Ordem fixa (cor segue a categoria, não o tamanho). Paleta validada pra
// daltonismo nos dois temas (globals.css, --wa-*).
export const CATEGORIAS = [
  { key: "MARKETING", nome: "Marketing", cor: "var(--wa-marketing)" },
  { key: "SERVICE", nome: "Atendimento", cor: "var(--wa-atendimento)" },
  { key: "UTILITY", nome: "Utilidade", cor: "var(--wa-utilidade)" },
  { key: "AUTHENTICATION", nome: "Autenticação", cor: "var(--wa-autenticacao)" },
] as const;

export type ChaveCategoria = (typeof CATEGORIAS)[number]["key"];

export function chaveCategoria(c: string): ChaveCategoria {
  return (CATEGORIAS.find((x) => x.key === c)?.key ?? "UTILITY") as ChaveCategoria;
}

export function nomeCategoria(c: string | null): string {
  if (!c) return "—";
  return CATEGORIAS.find((x) => x.key === c)?.nome ?? c.charAt(0) + c.slice(1).toLowerCase();
}

/** Mensagem cobrada = tipo REGULAR (as FREE_* não custam nada). */
export function cobrada(d: Pick<DiaWa, "tipo" | "custo">): boolean {
  return !d.tipo.startsWith("FREE") || d.custo > 0;
}

export function normalizar(p: unknown): PainelWa {
  const j = (p ?? {}) as Partial<PainelWa>;
  const n = (v: unknown) => (v == null ? 0 : Number(v));
  return {
    contas: j.contas ?? [],
    dias: (j.dias ?? []).map((d) => ({ ...d, volume: n(d.volume), custo: n(d.custo), custo_brl: n(d.custo_brl) })),
    modelos: (j.modelos ?? []).map((m) => ({
      ...m,
      enviados: n(m.enviados),
      entregues: n(m.entregues),
      lidos: n(m.lidos),
      cliques: n(m.cliques),
      custo: n(m.custo),
      custo_brl: n(m.custo_brl),
    })),
    cambio_hoje: j.cambio_hoje ? { dia: j.cambio_hoje.dia, venda: n(j.cambio_hoje.venda) } : null,
    atualizado_em: j.atualizado_em ?? null,
    ultima_sync: j.ultima_sync ?? null,
  };
}

export function somarDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function hojeSP(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10);
}

export function rotuloDia(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

export interface LinhaDia {
  dia: string;
  rotulo: string;
  total: number;
  mensagens: number;
  MARKETING: number;
  SERVICE: number;
  UTILITY: number;
  AUTHENTICATION: number;
}

/** Um ponto por dia do período (dia sem envio = zero), custo em reais. */
export function porDia(dias: DiaWa[], de: string, ate: string): LinhaDia[] {
  const mapa = new Map<string, LinhaDia>();
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    mapa.set(d, { dia: d, rotulo: rotuloDia(d), total: 0, mensagens: 0, MARKETING: 0, SERVICE: 0, UTILITY: 0, AUTHENTICATION: 0 });
  }
  for (const x of dias) {
    const l = mapa.get(x.dia);
    if (!l) continue;
    l[chaveCategoria(x.categoria)] += x.custo_brl;
    l.total += x.custo_brl;
    if (cobrada(x)) l.mensagens += x.volume;
  }
  return [...mapa.values()];
}

export interface LinhaCategoria {
  key: string;
  nome: string;
  mensagens: number;
  gratis: number;
  custo: number;
  custo_brl: number;
}

export function porCategoria(dias: DiaWa[]): LinhaCategoria[] {
  const mapa = new Map<string, LinhaCategoria>();
  for (const x of dias) {
    const k = x.categoria;
    const l = mapa.get(k) ?? { key: k, nome: nomeCategoria(k), mensagens: 0, gratis: 0, custo: 0, custo_brl: 0 };
    if (cobrada(x)) l.mensagens += x.volume;
    else l.gratis += x.volume;
    l.custo += x.custo;
    l.custo_brl += x.custo_brl;
    mapa.set(k, l);
  }
  const ordem = (k: string) => {
    const i = CATEGORIAS.findIndex((c) => c.key === k);
    return i < 0 ? 99 : i;
  };
  return [...mapa.values()].sort((a, b) => ordem(a.key) - ordem(b.key));
}

export interface LinhaConta {
  conta: ContaWa;
  mensagens: number;
  porCategoria: Record<ChaveCategoria, number>;
  total: number;
}

export function porConta(dias: DiaWa[], contas: ContaWa[]): LinhaConta[] {
  return contas
    .map((conta) => {
      const l: LinhaConta = {
        conta,
        mensagens: 0,
        porCategoria: { MARKETING: 0, SERVICE: 0, UTILITY: 0, AUTHENTICATION: 0 },
        total: 0,
      };
      for (const x of dias) {
        if (x.waba_id !== conta.waba_id) continue;
        l.porCategoria[chaveCategoria(x.categoria)] += x.custo_brl;
        l.total += x.custo_brl;
        if (cobrada(x)) l.mensagens += x.volume;
      }
      return l;
    })
    .filter((l) => l.total > 0 || l.mensagens > 0)
    .sort((a, b) => b.total - a.total);
}

export interface LinhaOrigem {
  origem: string;
  enviados: number;
  lidos: number;
  custo_brl: number;
  modelos: number;
}

export function porOrigem(modelos: ModeloWa[]): LinhaOrigem[] {
  const mapa = new Map<string, LinhaOrigem>();
  for (const m of modelos) {
    const l = mapa.get(m.origem) ?? { origem: m.origem, enviados: 0, lidos: 0, custo_brl: 0, modelos: 0 };
    l.enviados += m.enviados;
    l.lidos += m.lidos;
    l.custo_brl += m.custo_brl;
    if (m.enviados > 0 || m.custo_brl > 0) l.modelos += 1;
    mapa.set(m.origem, l);
  }
  return [...mapa.values()].filter((l) => l.custo_brl > 0 || l.enviados > 0).sort((a, b) => b.custo_brl - a.custo_brl);
}

export function brl2(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function usd(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function pct(a: number, b: number): string {
  return b > 0 ? `${Math.round((a / b) * 100)}%` : "—";
}
