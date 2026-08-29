import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Receita × distribuição × margem, mês a mês.
//
// Faturamento aqui é VENDA PAGA na data em que foi paga (Eduzz + Asaas), não o
// que pingou no Inter no mês — o extrato é caixa e chega picado por parcela.
//
// A distribuição aos sócios de um mês remunera o mês anterior: sai no dia útil
// combinado, depois do fechamento. Por isso a margem do mês usa a distribuição
// do mês SEGUINTE. Conta no banco: resultado_mensal() (migração 0049).

export interface MesResultado {
  /** "2026-07" */
  mes: string;
  faturamento: number;
  eduzz: number;
  asaas: number;
  /** Eduzz líquido (netGain, já sem a taxa da plataforma) + Asaas. */
  liquido: number;
  /** Distribuição que SAIU dentro do mês — bate com o extrato. */
  distribuicao: number;
  /** Distribuição do mês seguinte: é essa que remunera este faturamento. */
  distribuicaoM1: number;
  /** distribuicaoM1 ÷ faturamento, em %. null enquanto não fechou. */
  margem: number | null;
  /** O mês seguinte já passou pela data de distribuição? */
  fechado: boolean;
}

interface RpcRow {
  mes: string;
  faturamento: number | string;
  eduzz: number | string;
  asaas: number | string;
  liquido: number | string;
  distribuicao: number | string;
  distribuicao_m1: number | string;
  margem: number | string | null;
  fechado: boolean;
}

const getResultadoMensalCached = unstable_cache(fetchResultadoMensal, ["resultado-mensal-v1"], {
  revalidate: 300,
  tags: ["financeiro"],
});

export async function getResultadoMensal(meses = 13): Promise<MesResultado[]> {
  return getResultadoMensalCached(meses);
}

async function fetchResultadoMensal(meses: number): Promise<MesResultado[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin.rpc("resultado_mensal", { p_meses: meses });
    if (error || !data) return [];
    return (data as RpcRow[]).map((r) => ({
      mes: String(r.mes).slice(0, 7),
      faturamento: Number(r.faturamento ?? 0),
      eduzz: Number(r.eduzz ?? 0),
      asaas: Number(r.asaas ?? 0),
      liquido: Number(r.liquido ?? 0),
      distribuicao: Number(r.distribuicao ?? 0),
      distribuicaoM1: Number(r.distribuicao_m1 ?? 0),
      margem: r.margem == null ? null : Number(r.margem),
      fechado: Boolean(r.fechado),
    }));
  } catch {
    return [];
  }
}

/** Acumulado dos meses já fechados — a margem que vale para decidir. */
export function acumuladoFechado(linhas: MesResultado[]): {
  faturamento: number;
  distribuicao: number;
  margem: number | null;
  meses: number;
} {
  const fechados = linhas.filter((l) => l.fechado && l.faturamento > 0);
  const faturamento = fechados.reduce((a, l) => a + l.faturamento, 0);
  const distribuicao = fechados.reduce((a, l) => a + l.distribuicaoM1, 0);
  return {
    faturamento,
    distribuicao,
    margem: faturamento > 0 ? (100 * distribuicao) / faturamento : null,
    meses: fechados.length,
  };
}
