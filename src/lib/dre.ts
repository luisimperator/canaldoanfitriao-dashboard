// DRE do extrato: transforma lançamento de caixa em resultado.
//
// O extrato do Inter é dinheiro entrando e saindo. Pra virar resultado, cada
// lançamento precisa do papel contábil que a migração 0032 gravou em
// fin_categories.kind:
//
//   receita       entra no faturamento
//   tvc           custo totalmente variável (some do Throughput)
//   oe            despesa operacional
//   distribuicao  destinação de lucro — FORA do resultado
//   neutro        transferência/aplicação/estorno — fora dos dois lados
//
// Na linguagem do Goldratt:
//   Throughput = receita − tvc
//   Lucro      = Throughput − OE
//
// Distribuição fica de fora de propósito: pagar sócio não é custo de operar, é
// o que se faz DEPOIS de apurar o lucro. Contar como despesa é o erro que fazia
// junho/26 aparecer como prejuízo de R$ 95 mil num mês que deu lucro.

import type { DashboardData, FinCategory, FinTransaction } from "./types";
import { isoToday, monthKey } from "./metrics";

export type FinKind = "receita" | "tvc" | "oe" | "distribuicao" | "neutro";

/** Lançamento sem categoria não some do resultado: entra pelo sentido. */
const SEM_CATEGORIA = "Sem categoria";

function kindDe(t: FinTransaction, porId: Map<string, FinCategory>): FinKind {
  const c = t.categoryId ? porId.get(t.categoryId) : undefined;
  if (c?.kind) return c.kind;
  return t.direction === "in" ? "receita" : "oe";
}

function nomeDe(t: FinTransaction, porId: Map<string, FinCategory>): string {
  const c = t.categoryId ? porId.get(t.categoryId) : undefined;
  return c?.name ?? SEM_CATEGORIA;
}

export interface DreTotais {
  faturamento: number;
  tvc: number;
  /** receita − tvc */
  throughput: number;
  despesaOperacional: number;
  /** throughput − despesaOperacional */
  resultado: number;
  /** resultado ÷ faturamento; null quando não houve faturamento */
  margem: number | null;
  /** saiu pros sócios no período — informativo, fora do resultado */
  distribuido: number;
  /** transferência/aplicação/estorno — fora dos dois lados */
  neutro: number;
  /** quantos lançamentos ainda não têm categoria (entram pelo sentido) */
  semCategoriaQtd: number;
  semCategoriaValor: number;
  lancamentos: number;
}

export interface FatiaValor {
  nome: string;
  valor: number;
  /** participação no total da fatia (0–1) */
  pct: number;
}

export interface MesDre {
  month: string; // YYYY-MM
  label: string; // "jul/26"
  faturamento: number;
  despesa: number;
  resultado: number;
  margem: number | null;
  /** mês corrente, ainda correndo — comparar com mês fechado engana */
  parcial: boolean;
}

function noPeriodo(txs: FinTransaction[], de: string, ate: string): FinTransaction[] {
  return txs.filter((t) => t.transactionDate >= de && t.transactionDate <= ate);
}

export function dreTotais(
  data: DashboardData,
  de: string,
  ate: string
): DreTotais {
  const porId = new Map(data.finCategories.map((c) => [c.id, c]));
  const txs = noPeriodo(data.finTransactions, de, ate);

  let faturamento = 0;
  let tvc = 0;
  let oe = 0;
  let distribuido = 0;
  let neutro = 0;
  let semCategoriaQtd = 0;
  let semCategoriaValor = 0;

  for (const t of txs) {
    if (!t.categoryId) {
      semCategoriaQtd++;
      semCategoriaValor += t.amount;
    }
    switch (kindDe(t, porId)) {
      case "receita":
        faturamento += t.amount;
        break;
      case "tvc":
        tvc += t.amount;
        break;
      case "oe":
        oe += t.amount;
        break;
      case "distribuicao":
        distribuido += t.amount;
        break;
      case "neutro":
        neutro += t.amount;
        break;
    }
  }

  const throughput = faturamento - tvc;
  const resultado = throughput - oe;
  return {
    faturamento,
    tvc,
    throughput,
    despesaOperacional: oe,
    resultado,
    margem: faturamento > 0 ? resultado / faturamento : null,
    distribuido,
    neutro,
    semCategoriaQtd,
    semCategoriaValor,
    lancamentos: txs.length,
  };
}

/** Saldo em conta: todo o histórico, não só o período. É foto, não filme. */
export function saldoEmConta(data: DashboardData): number {
  let saldo = 0;
  for (const t of data.finTransactions) {
    saldo += t.direction === "in" ? t.amount : -t.amount;
  }
  return saldo;
}

/** De onde vem o dinheiro: categorias com kind 'receita', maior primeiro. */
export function fontesDeReceita(
  data: DashboardData,
  de: string,
  ate: string,
  limite = 10
): FatiaValor[] {
  const porId = new Map(data.finCategories.map((c) => [c.id, c]));
  const totais = new Map<string, number>();
  let total = 0;

  for (const t of noPeriodo(data.finTransactions, de, ate)) {
    if (kindDe(t, porId) !== "receita") continue;
    const nome = nomeDe(t, porId);
    totais.set(nome, (totais.get(nome) ?? 0) + t.amount);
    total += t.amount;
  }
  return agrupaComOutros(totais, total, limite);
}

/** Pra onde vai: categorias com kind 'oe' ou 'tvc', maior primeiro. */
export function destinosDeDespesa(
  data: DashboardData,
  de: string,
  ate: string,
  limite = 10
): FatiaValor[] {
  const porId = new Map(data.finCategories.map((c) => [c.id, c]));
  const totais = new Map<string, number>();
  let total = 0;

  for (const t of noPeriodo(data.finTransactions, de, ate)) {
    const k = kindDe(t, porId);
    if (k !== "oe" && k !== "tvc") continue;
    const nome = nomeDe(t, porId);
    totais.set(nome, (totais.get(nome) ?? 0) + t.amount);
    total += t.amount;
  }
  return agrupaComOutros(totais, total, limite);
}

// Uma lista de 20 categorias com 0,3% cada não diz nada. Do limite pra baixo
// tudo vira "Outros" — e "Outros" só aparece se houver mais de uma sobra, senão
// a última categoria apareceria renomeada, o que confunde.
function agrupaComOutros(
  totais: Map<string, number>,
  total: number,
  limite: number
): FatiaValor[] {
  const ordenado = [...totais.entries()].sort((a, b) => b[1] - a[1]);
  const pct = (v: number) => (total > 0 ? v / total : 0);

  if (ordenado.length <= limite + 1) {
    return ordenado.map(([nome, valor]) => ({ nome, valor, pct: pct(valor) }));
  }
  const topo = ordenado.slice(0, limite);
  const resto = ordenado.slice(limite).reduce((s, [, v]) => s + v, 0);
  return [
    ...topo.map(([nome, valor]) => ({ nome, valor, pct: pct(valor) })),
    { nome: "Outros", valor: resto, pct: pct(resto) },
  ];
}

/**
 * Resultado mês a mês dentro do período. O mês corrente vem marcado como
 * parcial: ele ainda está correndo e comparar com mês fechado engana.
 */
export function dreMensal(
  data: DashboardData,
  de: string,
  ate: string,
  hoje = isoToday()
): MesDre[] {
  const porId = new Map(data.finCategories.map((c) => [c.id, c]));
  const mesAtual = monthKey(hoje);
  const acc = new Map<string, { faturamento: number; despesa: number }>();

  for (const t of noPeriodo(data.finTransactions, de, ate)) {
    const k = kindDe(t, porId);
    if (k === "distribuicao" || k === "neutro") continue;
    const m = monthKey(t.transactionDate);
    const e = acc.get(m) ?? { faturamento: 0, despesa: 0 };
    if (k === "receita") e.faturamento += t.amount;
    else e.despesa += t.amount; // tvc + oe
    acc.set(m, e);
  }

  return [...acc.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, e]) => {
      const resultado = e.faturamento - e.despesa;
      const [y, m] = month.split("-").map(Number);
      return {
        month,
        label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        }),
        faturamento: Math.round(e.faturamento),
        despesa: Math.round(e.despesa),
        resultado: Math.round(resultado),
        margem: e.faturamento > 0 ? (resultado / e.faturamento) * 100 : null,
        parcial: month === mesAtual,
      };
    });
}

/** Média mensal de faturamento, contando só os meses que tiveram receita. */
export function mediaMensal(meses: MesDre[]): { valor: number; meses: number } {
  const comReceita = meses.filter((m) => m.faturamento > 0);
  if (comReceita.length === 0) return { valor: 0, meses: 0 };
  const soma = comReceita.reduce((s, m) => s + m.faturamento, 0);
  return { valor: soma / comReceita.length, meses: comReceita.length };
}
