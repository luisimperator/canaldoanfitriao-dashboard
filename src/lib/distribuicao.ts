import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { PoliticaDistribuicao } from "@/lib/politica-distribuicao";

// Distribuição dos sócios: o valor fica VIVO (recalculando com o caixa real)
// até o dia útil anterior à transferência, quando crava. Depois de cravado é
// esse número que vai pro Pix — e quando o Pix sai, o extrato dá baixa
// sozinho (transferência pro Rômulo/Luis Fernando em ±5 dias da data).
//
// Contas no banco: distribuicao_status() / distribuicao_fechar()
// (migração 0021_distribuicao_socios).

export interface SocioDistribuicao {
  id: number;
  nome: string;
  destino: string | null;
  percentual: number;
  valor: number;
  /** Quanto já saiu pra esse sócio na janela da distribuição (0 se nada). */
  pago: number;
  pagoEm: string | null;
}

export interface DistribuicaoStatus {
  hoje: string;
  competencia: string;
  dataDistribuicao: string;
  /** Dia útil anterior à transferência: até aqui o valor ainda muda. */
  dataFechamento: string;
  fechado: boolean;
  fechadoEm: string | null;
  fechadoPor: string | null;
  podeFechar: boolean;
  /** O que vale hoje: cravado se já fechou, senão o vivo. */
  valor: number;
  /** Recalculado agora, mesmo depois de cravado (pra comparar). Já redondo. */
  valorVivo: number;
  /** Antes de arredondar — a conta cheia do caixa livre. */
  valorBruto: number;
  /** Passo do arredondamento (R$ 1.000 por padrão). */
  arredondamento: number;
  /** Quanto se tira ALÉM do caixa livre por causa do arredondamento pra cima. */
  extraArredondamento: number;
  socios: SocioDistribuicao[];
  realizado: {
    total: number;
    primeiraData: string | null;
    ultimaData: string | null;
    lancamentos: { dia: string; valor: number; quem: string }[];
  };
  politica: PoliticaDistribuicao | null;
}

interface RpcSocio {
  id: number;
  nome: string;
  destino: string | null;
  percentual: number;
  valor: number;
  pago: number;
  pago_em: string | null;
}

interface RpcShape {
  hoje: string;
  competencia: string;
  data_distribuicao: string;
  data_fechamento: string;
  fechado: boolean;
  fechado_em: string | null;
  fechado_por: string | null;
  pode_fechar: boolean;
  valor: number;
  valor_vivo: number;
  valor_bruto: number;
  arredondamento: number;
  extra_arredondamento: number;
  socios: RpcSocio[] | null;
  realizado: {
    total: number;
    primeira_data: string | null;
    ultima_data: string | null;
    lancamentos: { dia: string; valor: number; quem: string }[] | null;
  } | null;
  politica: Record<string, unknown> | null;
}

// A RPC chama provisao_caixa() por dentro (varredura de ~2,3s). TTL curto de
// propósito: é dinheiro na tela e mudança de parâmetro (piso, %) tem que
// aparecer rápido. A chave leva versão — bumpar invalida na hora do deploy.
const getDistribuicaoCached = unstable_cache(fetchDistribuicao, ["distribuicao-v2"], {
  revalidate: 60,
  tags: ["provisao"],
});

export async function getDistribuicao(): Promise<DistribuicaoStatus | null> {
  return getDistribuicaoCached();
}

function parsePolitica(j: Record<string, unknown> | null): PoliticaDistribuicao | null {
  if (!j) return null;
  const n = (k: string) => Number(j[k] ?? 0);
  return {
    hoje: String(j.hoje ?? ""),
    dataDistribuicao: String(j.data_distribuicao ?? ""),
    horizonte: String(j.horizonte ?? ""),
    caixaHoje: n("caixa_hoje"),
    caixaNaData: n("caixa_na_data"),
    menorCaixaDoPeriodo: n("menor_caixa_do_periodo"),
    diaDoVale: String(j.dia_do_vale ?? ""),
    pisoOperacional: n("piso_operacional"),
    cofreAntes: n("cofre_antes"),
    colchaoExigido: n("colchao_exigido"),
    percentualReserva: n("percentual_reserva"),
    disponivelTotal: n("disponivel_total"),
    vaiProCofre: n("vai_pro_cofre"),
    aDistribuir: n("a_distribuir"),
    cofreDepois: n("cofre_depois"),
    metaValor: n("meta_valor"),
    progressoMeta: j.progresso_meta == null ? null : Number(j.progresso_meta),
  };
}

async function fetchDistribuicao(): Promise<DistribuicaoStatus | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.rpc("distribuicao_status");
    if (error || !data) return null;
    const r = data as RpcShape;
    return {
      hoje: r.hoje,
      competencia: r.competencia,
      dataDistribuicao: r.data_distribuicao,
      dataFechamento: r.data_fechamento,
      fechado: Boolean(r.fechado),
      fechadoEm: r.fechado_em,
      fechadoPor: r.fechado_por,
      podeFechar: Boolean(r.pode_fechar),
      valor: r.valor ?? 0,
      valorVivo: r.valor_vivo ?? 0,
      valorBruto: r.valor_bruto ?? 0,
      arredondamento: r.arredondamento ?? 0,
      extraArredondamento: r.extra_arredondamento ?? 0,
      socios: (r.socios ?? []).map((s) => ({
        id: s.id,
        nome: s.nome,
        destino: s.destino,
        percentual: Number(s.percentual),
        valor: Number(s.valor),
        pago: Number(s.pago ?? 0),
        pagoEm: s.pago_em,
      })),
      realizado: {
        total: r.realizado?.total ?? 0,
        primeiraData: r.realizado?.primeira_data ?? null,
        ultimaData: r.realizado?.ultima_data ?? null,
        lancamentos: r.realizado?.lancamentos ?? [],
      },
      politica: parsePolitica(r.politica),
    };
  } catch {
    return null;
  }
}

/** Já saiu dinheiro pros sócios nesta janela? Então a distribuição foi paga. */
export function foiPaga(d: DistribuicaoStatus): boolean {
  return d.realizado.total > 0;
}
