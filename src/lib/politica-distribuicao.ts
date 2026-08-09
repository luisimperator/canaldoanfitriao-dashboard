import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Política de distribuição: todo dia 10 o caixa livre é partido em duas fatias
// — uma vai pro cofre (reserva que cresce até a meta), o resto vai pros sócios.
//
// O "livre" é o menor saldo projetado do horizonte (mês corrente + seguinte)
// menos o colchão exigido, que é o maior entre o piso operacional e o cofre já
// acumulado. Contas em @/supabase/migrations/0021+0022.

export interface PoliticaDistribuicao {
  hoje: string;
  dataDistribuicao: string;
  horizonte: string;
  caixaHoje: number;
  caixaNaData: number;
  menorCaixaDoPeriodo: number;
  diaDoVale: string;
  pisoOperacional: number;
  cofreAntes: number;
  colchaoExigido: number;
  percentualReserva: number;
  disponivelTotal: number;
  vaiProCofre: number;
  aDistribuir: number;
  cofreDepois: number;
  metaValor: number;
  progressoMeta: number | null;
}

interface RpcShape {
  hoje: string;
  data_distribuicao: string;
  horizonte: string;
  caixa_hoje: number;
  caixa_na_data: number;
  menor_caixa_do_periodo: number;
  dia_do_vale: string;
  piso_operacional: number;
  cofre_antes: number;
  colchao_exigido: number;
  percentual_reserva: number;
  disponivel_total: number;
  vai_pro_cofre: number;
  a_distribuir: number;
  cofre_depois: number;
  meta_valor: number;
  progresso_meta: number | null;
}

/** Próxima data de distribuição: o dia `dia` deste mês, ou do mês que vem se já passou. */
export function proximaDistribuicao(hoje: string, dia = 10): string {
  const [y, m, d] = hoje.split("-").map(Number);
  const alvo = d <= dia ? new Date(Date.UTC(y, m - 1, dia)) : new Date(Date.UTC(y, m, dia));
  return alvo.toISOString().slice(0, 10);
}

// Mesma história da provisão: a RPC chama provisao_caixa() por dentro, então
// sem cache a página pagava a varredura duas vezes.
const getPoliticaCached = unstable_cache(
  fetchPolitica,
  ["politica-distribuicao-v1"],
  { revalidate: 300, tags: ["provisao"] }
);

export async function getPoliticaDistribuicao(
  data?: string
): Promise<PoliticaDistribuicao | null> {
  return getPoliticaCached(data);
}

/** Mesma data, um mês pra frente: 2026-08-10 → 2026-09-10. */
export function umMesDepois(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

/**
 * Prévia da distribuição SEGUINTE, com a mesma régua da atual.
 *
 * É estimativa de verdade, não promessa: a maior parte das entradas do próximo
 * ciclo ainda nem foi vendida, então o número sobe conforme o mês roda. Serve
 * pra ter ordem de grandeza com antecedência, não pra planejar em cima.
 */
export async function getProximaDistribuicao(
  dataAtual: string
): Promise<PoliticaDistribuicao | null> {
  return getPoliticaCached(umMesDepois(dataAtual));
}

async function fetchPolitica(data?: string): Promise<PoliticaDistribuicao | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data: raw, error } = await admin.rpc("politica_distribuicao", {
      p_data: data ?? undefined,
    });
    if (error || !raw) return null;
    const r = raw as RpcShape;
    return {
      hoje: r.hoje,
      dataDistribuicao: r.data_distribuicao,
      horizonte: r.horizonte,
      caixaHoje: r.caixa_hoje ?? 0,
      caixaNaData: r.caixa_na_data ?? 0,
      menorCaixaDoPeriodo: r.menor_caixa_do_periodo ?? 0,
      diaDoVale: r.dia_do_vale,
      pisoOperacional: r.piso_operacional ?? 0,
      cofreAntes: r.cofre_antes ?? 0,
      colchaoExigido: r.colchao_exigido ?? 0,
      percentualReserva: r.percentual_reserva ?? 0,
      disponivelTotal: r.disponivel_total ?? 0,
      vaiProCofre: r.vai_pro_cofre ?? 0,
      aDistribuir: r.a_distribuir ?? 0,
      cofreDepois: r.cofre_depois ?? 0,
      metaValor: r.meta_valor ?? 0,
      progressoMeta: r.progresso_meta,
    };
  } catch {
    return null;
  }
}
