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

// Meses pra frente (Fernando, 27/11): o que já se sabe que entra no caixa em
// cada mês futuro e a fatura da Meta que vence nele. RPC painel_caixa_futuro
// (migração 0158).
export interface MesFuturo {
  mes: string; // YYYY-MM-01
  eduzz_liberar: number;
  eduzz_liberar_n: number;
  eduzz_agendado: number;
  eduzz_agendado_n: number;
  renovacao_potencial: number;
  renovacao_esperada: number;
  renovacao_n: number;
  tmb: number;
  tmb_n: number;
  meta_aberta: number;
}

export interface CaixaFuturo {
  meses: MesFuturo[];
  taxa_renovacao: number;
  fator_liquido: number;
}

export function normalizarFuturo(p: unknown): CaixaFuturo {
  const j = (p ?? {}) as Partial<CaixaFuturo>;
  return {
    meses: (j.meses ?? []).map((m) => ({
      mes: m.mes,
      eduzz_liberar: num(m.eduzz_liberar),
      eduzz_liberar_n: num(m.eduzz_liberar_n),
      eduzz_agendado: num(m.eduzz_agendado),
      eduzz_agendado_n: num(m.eduzz_agendado_n),
      renovacao_potencial: num(m.renovacao_potencial),
      renovacao_esperada: num(m.renovacao_esperada),
      renovacao_n: num(m.renovacao_n),
      tmb: num(m.tmb),
      tmb_n: num(m.tmb_n),
      meta_aberta: num(m.meta_aberta),
    })),
    taxa_renovacao: num(j.taxa_renovacao),
    fator_liquido: num(j.fator_liquido),
  };
}

/** Entradas que já se sabe que caem no mês (renovação pela taxa histórica). */
export function entradasPrevistas(m: MesFuturo): number {
  return m.eduzz_liberar + m.eduzz_agendado + m.renovacao_esperada + m.tmb;
}

/** "2026-11-01" + n meses → "YYYY-MM-01". */
export function somarMeses(mes: string, n: number): string {
  const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

export function diasNoMes(mes: string): number {
  return new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
}
