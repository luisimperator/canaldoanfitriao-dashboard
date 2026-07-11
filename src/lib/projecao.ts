import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Projeção financeira (6 meses): parte do caixa de hoje e projeta mês a mês
// com 3 cenários. Receita projetada = média dos últimos 6 meses FECHADOS
// (ajustada pelo cenário), com PISO no que já está contratado na Eduzz
// (parcelas pagas com liberação futura — dinheiro certo). Despesa projetada =
// média dos 6 meses fechados, igual nos 3 cenários. Mês corrente usa o
// realizado até hoje + estimativa proporcional dos dias restantes.

export interface ProjecaoRaw {
  hoje: string;
  caixa: number;
  mes_atual: { entradas: number; saidas: number };
  eduzz_futuro: { mes: string; valor: number }[];
  historico: { mes: string; entradas: number; saidas: number }[];
}

export interface MesProjetado {
  mes: string; // YYYY-MM
  contratadoEduzz: number;
  entradas: { cons: number; base: number; otm: number };
  saidas: number;
  saldoFim: { cons: number; base: number; otm: number };
}

export interface Projecao {
  hoje: string;
  caixa: number;
  mediaEntradas: number;
  mediaSaidas: number;
  contratadoTotal: number;
  meses: MesProjetado[];
}

const FATOR = { cons: 0.8, base: 1, otm: 1.2 } as const;
const HORIZONTE = 6;

function addMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getProjecao(): Promise<Projecao | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.rpc("projecao_financeira");
    if (error || !data) return null;
    const raw = data as ProjecaoRaw;

    const hist = raw.historico ?? [];
    if (hist.length === 0) return null;
    const mediaEntradas = hist.reduce((a, h) => a + h.entradas, 0) / hist.length;
    const mediaSaidas = hist.reduce((a, h) => a + h.saidas, 0) / hist.length;
    const eduzzFuturo = new Map((raw.eduzz_futuro ?? []).map((e) => [e.mes, e.valor]));
    const contratadoTotal = (raw.eduzz_futuro ?? []).reduce((a, e) => a + e.valor, 0);

    const mesAtual = raw.hoje.slice(0, 7);
    const diaHoje = Number(raw.hoje.slice(8, 10));
    const [y, m] = mesAtual.split("-").map(Number);
    const diasNoMes = new Date(y, m, 0).getDate();
    const fracRestante = Math.max(0, (diasNoMes - diaHoje) / diasNoMes);

    const saldo = { cons: raw.caixa, base: raw.caixa, otm: raw.caixa };
    const meses: MesProjetado[] = [];

    for (let i = 0; i < HORIZONTE; i++) {
      const mes = addMonth(mesAtual, i);
      const contratado = eduzzFuturo.get(mes) ?? 0;
      const entradas = { cons: 0, base: 0, otm: 0 };
      let saidas: number;

      for (const c of ["cons", "base", "otm"] as const) {
        if (i === 0) {
          // mês corrente: realizado + o maior entre (ritmo médio dos dias que
          // faltam) e (o que a Eduzz já tem contratado pra liberar até o fim).
          const restanteMedio = mediaEntradas * FATOR[c] * fracRestante;
          entradas[c] = raw.mes_atual.entradas + Math.max(restanteMedio, contratado);
        } else {
          // meses cheios: média ajustada, com piso no contratado (a média já
          // CONTÉM liberações da Eduzz — o contratado não soma, ancora).
          entradas[c] = Math.max(mediaEntradas * FATOR[c], contratado);
        }
      }
      saidas = i === 0 ? raw.mes_atual.saidas + mediaSaidas * fracRestante : mediaSaidas;

      for (const c of ["cons", "base", "otm"] as const) {
        saldo[c] += entradas[c] - saidas;
      }
      meses.push({
        mes,
        contratadoEduzz: contratado,
        entradas: { ...entradas },
        saidas,
        saldoFim: { ...saldo },
      });
    }

    return {
      hoje: raw.hoje,
      caixa: raw.caixa,
      mediaEntradas,
      mediaSaidas,
      contratadoTotal,
      meses,
    };
  } catch {
    return null;
  }
}
