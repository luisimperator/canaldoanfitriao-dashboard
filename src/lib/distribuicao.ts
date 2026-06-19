import { getSupabaseAdmin } from "@/lib/supabase-admin";

// ───────────────────────────────────────────────────────────────────────────
// Modelo de distribuição dos sócios (Fernando 40% / Rômulo 60%).
// O fechamento é todo dia 10, sobre o caixa do ciclo (10 do mês anterior → 10).
// Fernando puxa sempre a fatia cheia (40%); Rômulo às vezes deixa parte como
// capital de giro. Projeção = receita do ciclo − custos do ciclo, × 40%.
//
// PREMISSAS (ajuste aqui conforme a realidade do mês):
// ───────────────────────────────────────────────────────────────────────────
const FERNANDO_PCT = 0.4;

// Receita Eduzz líquida de um mês de entressafra (pós-lançamento). Usada quando
// ainda não há vendas suficientes agendadas para o ciclo (Ago/Set).
const EDUZZ_BASELINE = 120000;

// Custos fixos por ciclo
const IMPOSTOS = 30000; // SIMPLES + Receita, sobre receita de entressafra
const AGENCIAS_FOLHA = 20000; // Pitacus + OM Marketing + contador + folha

// Boleto da Meta: o gasto do mês M vence ~fim de M+1, então cai no fechamento
// ~2 meses depois do gasto. Valores = gasto estimado do mês indicado.
const META_BOLETO: Record<string, number> = {
  "2026-07": 22000, // gasto de MAIO (entressafra)
  "2026-08": 35000, // gasto de JUNHO (subindo p/ o 4º Encontro)
  "2026-09": 45000, // gasto de JULHO (pico de mídia do evento)
};
const META_BOLETO_PADRAO = 40000;

// Patrocínios do 4º Encontro de Anfitriões. Ajuste o campo `fechamento` para o
// dia 10 do mês em que o dinheiro do patrocinador realmente entra.
const PATROCINIOS: { nome: string; valor: number; fechamento: string }[] = [
  { nome: "Stays", valor: 12500, fechamento: "2026-07" },
  { nome: "OwnerPro", valor: 10000, fechamento: "2026-07" },
  { nome: "Hostfully", valor: 12500, fechamento: "2026-07" },
  { nome: "EcoHost", valor: 5000, fechamento: "2026-07" },
];

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export interface LinhaProj {
  label: string;
  valor: number;
  tipo: "entrada" | "saida";
}
export interface CicloProj {
  fechamento: string; // YYYY-MM-DD
  label: string; // "10/jul"
  linhas: LinhaProj[];
  patrocinios: { nome: string; valor: number }[];
  cicloNet: number;
  fernando: number;
  romulo: number;
}
export interface DistribData {
  caixa: number;
  tmbMensal: number;
  hoje: string;
  historico: { mes: string; fernando: number; romulo: number }[];
  projecoes: CicloProj[];
}

function fechLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  void y;
  return `${d}/${MESES[m - 1]}`;
}

export async function getDistribuicao(): Promise<DistribData | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.rpc("socios_dashboard");
  if (error || !data) return null;

  const raw = data as {
    caixa: number;
    tmb_mensal: number;
    hoje: string;
    historico: { mes: string; fernando: number; romulo: number }[];
    ciclos: { ini: string; fim: string; eduzz_agendado: number; eduzz_a_creditar: number }[];
  };

  const tmb = Math.round(raw.tmb_mensal || 0);

  const projecoes: CicloProj[] = (raw.ciclos ?? []).map((c) => {
    const mesKey = c.fim.slice(0, 7);
    const eduzz = Math.max(Number(c.eduzz_agendado) || 0, EDUZZ_BASELINE);
    const patroc = PATROCINIOS.filter((p) => p.fechamento === mesKey);
    const patrocTotal = patroc.reduce((a, p) => a + p.valor, 0);
    const meta = META_BOLETO[mesKey] ?? META_BOLETO_PADRAO;

    const linhas: LinhaProj[] = [
      { label: "Receita Eduzz (líq., cai no ciclo)", valor: eduzz, tipo: "entrada" },
      { label: "TMB (parcelas)", valor: tmb, tipo: "entrada" },
    ];
    if (patrocTotal > 0) linhas.push({ label: "Patrocínios do evento", valor: patrocTotal, tipo: "entrada" });
    linhas.push(
      { label: "Boleto Meta (gasto de ~2 meses antes)", valor: meta, tipo: "saida" },
      { label: "Impostos (SIMPLES + Receita)", valor: IMPOSTOS, tipo: "saida" },
      { label: "Agências + folha", valor: AGENCIAS_FOLHA, tipo: "saida" }
    );

    const entradas = eduzz + tmb + patrocTotal;
    const saidas = meta + IMPOSTOS + AGENCIAS_FOLHA;
    const cicloNet = entradas - saidas;
    const fernando = Math.max(0, Math.round(cicloNet * FERNANDO_PCT));
    const romulo = Math.max(0, Math.round(cicloNet * (1 - FERNANDO_PCT)));

    return {
      fechamento: c.fim,
      label: fechLabel(c.fim),
      linhas,
      patrocinios: patroc.map((p) => ({ nome: p.nome, valor: p.valor })),
      cicloNet,
      fernando,
      romulo,
    };
  });

  return {
    caixa: Math.round(raw.caixa || 0),
    tmbMensal: tmb,
    hoje: raw.hoje,
    historico: raw.historico ?? [],
    projecoes,
  };
}
