// Tráfego da Meta por ciclo de cobrança: tipos e contas do painel
// /custos/trafego. Os números vêm da Meta (migração 0149: faturas, saldo das
// contas e gasto mensal) e das vendas do painel (Eduzz, TMB, Imersão).

export interface CicloMeta {
  mes: string; // YYYY-MM-01
  gasto: number;
  compras_meta: number;
  fatura: number | null;
  em_aberto: number | null;
  vence_em: string | null;
  situacao: string | null;
  numeros: string | null;
  fatura_prevista: number | null;
  vence_previsto: string | null;
  provisao: number | null;
  provisao_data: string | null;
  eduzz: number;
  eduzz_n: number;
  tmb: number;
  tmb_n: number;
  imersao: number;
  imersao_n: number;
}

export interface ContaMeta {
  conta_id: string;
  nome: string | null;
  saldo: number | null;
  pagamento: string | null;
}

export interface PainelMeta {
  ciclos: CicloMeta[];
  fator_imposto: number | null;
  contas: ContaMeta[];
  gasto_dias: { dia: string; gasto: number }[];
  ultima_sync: { em: string; note: string; erros: string[] | null } | null;
}

const num = (v: unknown) => (v == null ? 0 : Number(v));
const numOuNulo = (v: unknown) => (v == null ? null : Number(v));

export function normalizar(p: unknown): PainelMeta {
  const j = (p ?? {}) as Partial<PainelMeta>;
  return {
    ciclos: (j.ciclos ?? []).map((c) => ({
      ...c,
      gasto: num(c.gasto),
      compras_meta: num(c.compras_meta),
      fatura: numOuNulo(c.fatura),
      em_aberto: numOuNulo(c.em_aberto),
      fatura_prevista: numOuNulo(c.fatura_prevista),
      provisao: numOuNulo(c.provisao),
      eduzz: num(c.eduzz),
      eduzz_n: num(c.eduzz_n),
      tmb: num(c.tmb),
      tmb_n: num(c.tmb_n),
      imersao: num(c.imersao),
      imersao_n: num(c.imersao_n),
    })),
    fator_imposto: numOuNulo(j.fator_imposto),
    contas: (j.contas ?? []).map((c) => ({ ...c, saldo: numOuNulo(c.saldo) })),
    gasto_dias: (j.gasto_dias ?? []).map((d) => ({ dia: d.dia, gasto: num(d.gasto) })),
    ultima_sync: j.ultima_sync ?? null,
  };
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function rotuloCiclo(mes: string): string {
  const [y, m] = mes.split("-");
  return `${MESES[Number(m) - 1]}/${y.slice(2)}`;
}

export function diaBR(ymd: string | null): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

export function faturamento(c: CicloMeta): number {
  return c.eduzz + c.tmb + c.imersao;
}

/** A fatura do ciclo: a real, ou a prevista enquanto a Meta não emite. */
export function faturaDoCiclo(c: CicloMeta): number | null {
  return c.fatura ?? c.fatura_prevista;
}

export type Situacao =
  | { tipo: "paga" }
  | { tipo: "aberta"; dias: number }
  | { tipo: "prevista" }
  | { tipo: "sem_fatura" };

export function situacao(c: CicloMeta, hoje: string): Situacao {
  if (c.fatura != null) {
    if ((c.em_aberto ?? 0) > 0) {
      const dias = c.vence_em ? Math.round((Date.parse(c.vence_em) - Date.parse(hoje)) / 86_400_000) : 0;
      return { tipo: "aberta", dias };
    }
    return { tipo: "paga" };
  }
  if (c.fatura_prevista != null) return { tipo: "prevista" };
  return { tipo: "sem_fatura" };
}

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function brl2(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function vezes(a: number, b: number | null): string {
  if (!b || b <= 0) return "—";
  return `${(a / b).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}x`;
}
