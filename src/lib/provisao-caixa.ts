import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Provisão de caixa: quando o dinheiro da Eduzz cai de verdade, somado ao
// caixa do Inter e às saídas previstas. Fonte: RPC provisao_caixa()
// (migração 0016) — liberações pagas usam o creditDate exato da Eduzz;
// "a vencer" assume pagamento no vencimento + mediana real por método.

export interface ProvisaoItem {
  nome: string;
  produto: string;
  metodo: string;
  valor: number;
}

export interface ProvisaoDia {
  dia: string; // YYYY-MM-DD (America/Sao_Paulo)
  valor: number;
  cobrancas: number;
  items: ProvisaoItem[];
}

export interface SaidaRecorrente {
  quem: string;
  valor: number;
  dia: number; // dia típico do mês
  meses: number; // em quantos dos últimos 4 meses apareceu
}

export interface ProvisaoCaixa {
  hoje: string;
  saldoInter: number;
  saldoEduzzAncora: { valor: number; informadoEm: string } | null;
  liberadoDesdeAncora: number;
  aLiberarTotal: number;
  aLiberarCobrancas: number;
  pagoPorDia: ProvisaoDia[];
  aVencerPorDia: ProvisaoDia[];
  aVencerTotal: number;
  aVencerCobrancas: number;
  lags: Record<string, number>;
  saidasRecorrentes: SaidaRecorrente[];
  mediaSaidasMes: number;
}

interface RpcShape {
  hoje: string;
  saldo_inter: number | null;
  saldo_eduzz_ancora: { valor: number; informado_em: string } | null;
  liberado_desde_ancora: number | null;
  a_liberar_total: number;
  a_liberar_cobrancas: number;
  pago_por_dia: ProvisaoDia[];
  a_vencer_por_dia: ProvisaoDia[];
  a_vencer_total: number;
  a_vencer_cobrancas: number;
  lags: Record<string, number>;
  saidas_recorrentes: SaidaRecorrente[];
  media_saidas_mes: number | null;
}

export async function getProvisaoCaixa(): Promise<ProvisaoCaixa | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.rpc("provisao_caixa");
    if (error || !data) return null;
    const raw = data as RpcShape;
    return {
      hoje: raw.hoje,
      saldoInter: raw.saldo_inter ?? 0,
      saldoEduzzAncora: raw.saldo_eduzz_ancora
        ? { valor: raw.saldo_eduzz_ancora.valor, informadoEm: raw.saldo_eduzz_ancora.informado_em }
        : null,
      liberadoDesdeAncora: raw.liberado_desde_ancora ?? 0,
      aLiberarTotal: raw.a_liberar_total ?? 0,
      aLiberarCobrancas: raw.a_liberar_cobrancas ?? 0,
      pagoPorDia: raw.pago_por_dia ?? [],
      aVencerPorDia: raw.a_vencer_por_dia ?? [],
      aVencerTotal: raw.a_vencer_total ?? 0,
      aVencerCobrancas: raw.a_vencer_cobrancas ?? 0,
      lags: raw.lags ?? {},
      saidasRecorrentes: raw.saidas_recorrentes ?? [],
      mediaSaidasMes: raw.media_saidas_mes ?? 0,
    };
  } catch {
    return null;
  }
}

/** Soma dos dias (pago e a vencer) até a data-limite, inclusive. */
export function somaAte(dias: ProvisaoDia[], cutoff: string): number {
  return dias.filter((d) => d.dia <= cutoff).reduce((a, d) => a + d.valor, 0);
}

export const METODO_LABEL: Record<string, string> = {
  creditCard: "Cartão",
  pix: "Pix",
  bankslip: "Boleto",
  paypal: "PayPal",
};
