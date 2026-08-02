import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { isoToday, monthKey } from "@/lib/metrics";
import {
  destinosDeDespesa,
  dreMensal,
  dreTotais,
  fontesDeReceita,
  mediaMensal,
  saldoEmConta,
  type FatiaValor,
} from "@/lib/dre";
import { brl } from "@/lib/format";
import { DemoBanner } from "@/components/ui";
import { DateRangePicker } from "@/components/DateRangePicker";
import { EntradasSaidasChart, ResultadoLinhaChart } from "@/components/charts";

export const dynamic = "force-dynamic";

// Visão geral financeira: saldo, faturamento, margem e resultado do período,
// mais de onde vem e pra onde vai o dinheiro.
//
// O período escolhido governa os números do topo; os dois gráficos mensais
// mostram sempre os últimos 12 meses, porque tendência num recorte de um mês
// não é tendência.

const MESES_GRAFICO = 12;

/** Rótulo do período no formato do cabeçalho: "JUL/2026" ou "FEV–JUL/2026". */
function etiquetaPeriodo(de: string, ate: string): string {
  const fmt = (iso: string) => {
    const [y, m] = iso.split("-").map(Number);
    const mes = new Date(Date.UTC(y, m - 1, 1))
      .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
      .replace(".", "")
      .toUpperCase();
    return { mes, ano: y };
  };
  const a = fmt(de);
  const b = fmt(ate);
  if (a.mes === b.mes && a.ano === b.ano) return `${a.mes}/${a.ano}`;
  if (a.ano === b.ano) return `${a.mes}–${b.mes}/${a.ano}`;
  return `${a.mes}/${a.ano} – ${b.mes}/${b.ano}`;
}

function primeiroDiaDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function mesesAtras(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 10);
}

const EYEBROW =
  "font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500";
const CARD =
  "rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#121826] p-5";

function Painel({
  eyebrow,
  titulo,
  extra,
  children,
}: {
  eyebrow: string;
  titulo: string;
  extra?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className={EYEBROW}>{eyebrow}</span>
        {extra && (
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">{extra}</span>
        )}
      </div>
      <h2 className="mt-1 mb-4 text-base font-bold text-slate-900 dark:text-zinc-100">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Kpi({
  label,
  valor,
  cor,
  nota,
}: {
  label: string;
  valor: string;
  cor: string;
  nota?: string;
}) {
  return (
    <div className={CARD}>
      <div className={EYEBROW}>{label}</div>
      <div className={`mt-2 text-2xl sm:text-[28px] font-bold tabular-nums leading-none ${cor}`}>
        {valor}
      </div>
      {nota && (
        <div className="mt-2 text-[11px] leading-snug text-slate-400 dark:text-zinc-500">
          {nota}
        </div>
      )}
    </div>
  );
}

// Barras de participação. A cor é só identificação — o número já está escrito
// ao lado, então a paleta não precisa carregar significado.
const CORES = [
  "#8b5cf6", "#22d3ee", "#34d399", "#fbbf24", "#f472b6",
  "#a78bfa", "#fb923c", "#94a3b8", "#60a5fa", "#2dd4bf", "#4ade80",
];

function ListaFatias({ fatias, vazio }: { fatias: FatiaValor[]; vazio: string }) {
  if (fatias.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-zinc-400">{vazio}</p>;
  }
  return (
    <ul className="space-y-3">
      {fatias.map((f, i) => (
        <li key={f.nome}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-slate-700 dark:text-zinc-300">
              {f.nome}
            </span>
            <span className="flex shrink-0 items-baseline gap-3">
              <span className="text-xs tabular-nums text-slate-400 dark:text-zinc-500">
                {(f.pct * 100).toFixed(1).replace(".", ",")}%
              </span>
              <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                {brl(f.valor)}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(f.pct * 100, 1)}%`,
                background: CORES[i % CORES.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function VisaoGeralFinanceiraPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const data = await getDashboardData();
  const hoje = isoToday();

  // Padrão: mês corrente, como no seletor do topo.
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const ate = sp.to && re.test(sp.to) ? (sp.to > hoje ? hoje : sp.to) : hoje;
  const de = sp.from && re.test(sp.from) ? sp.from : primeiroDiaDoMes(hoje);

  const totais = dreTotais(data, de, ate);
  const saldo = saldoEmConta(data);
  const fontes = fontesDeReceita(data, de, ate);
  const destinos = destinosDeDespesa(data, de, ate);

  // Gráficos: sempre 12 meses, independentes do período escolhido.
  const janela = mesesAtras(hoje, MESES_GRAFICO - 1).slice(0, 7) + "-01";
  const mensal = dreMensal(data, janela, hoje, hoje);
  const media = mediaMensal(mensal);

  const resultadoPositivo = totais.resultado >= 0;
  const margemPct =
    totais.margem === null ? "—" : `${(totais.margem * 100).toFixed(1).replace(".", ",")}%`;

  return (
    <div>
      <DemoBanner show={data.isDemo} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-500 dark:text-emerald-400">
            {etiquetaPeriodo(de, ate)}
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
            Visão Geral
          </h1>
        </div>
        <DateRangePicker placeholder="Este mês" />
      </div>

      {/* Saldo: foto do caixa agora, não do período. */}
      <div className={`${CARD} mb-4 flex flex-wrap items-center justify-between gap-3`}>
        <span className="flex items-center gap-2.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              saldo >= 0 ? "bg-emerald-400" : "bg-rose-400"
            }`}
          />
          <span className="text-base font-medium text-slate-900 dark:text-zinc-100">
            Saldo em conta
          </span>
          <span className="text-sm text-slate-400 dark:text-zinc-500">
            · Banco Inter, agora
          </span>
        </span>
        <span
          className={`text-xl sm:text-2xl font-bold tabular-nums ${
            saldo >= 0 ? "text-slate-900 dark:text-zinc-100" : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {brl(saldo)}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Kpi
          label="Faturamento"
          valor={brl(totais.faturamento)}
          cor="text-emerald-500 dark:text-emerald-400"
          nota={`${totais.lancamentos} lançamento${totais.lancamentos === 1 ? "" : "s"} no período`}
        />
        <Kpi
          label="Média mensal"
          valor={brl(media.valor)}
          cor="text-violet-500 dark:text-violet-400"
          nota={
            media.meses > 0
              ? `${media.meses} ${media.meses === 1 ? "mês" : "meses"} com receita nos últimos ${MESES_GRAFICO}`
              : "sem receita nos últimos 12 meses"
          }
        />
        <Kpi
          label="Margem líquida"
          valor={margemPct}
          cor="text-cyan-500 dark:text-cyan-400"
          nota="Resultado ÷ Faturamento · distribuição aos sócios não desconta"
        />
        <Kpi
          label="Resultado"
          valor={brl(totais.resultado)}
          cor={
            resultadoPositivo
              ? "text-emerald-500 dark:text-emerald-400"
              : "text-rose-500 dark:text-rose-400"
          }
          nota={`${resultadoPositivo ? "Lucro" : "Prejuízo"} no período · faturamento − despesa operacional`}
        />
      </div>

      {/* Distribuição fica fora do resultado, então precisa aparecer em algum
          lugar — senão some do painel e ninguém lembra que saiu do caixa. */}
      {totais.distribuido > 0 && (
        <div className={`${CARD} mb-4 flex flex-wrap items-center justify-between gap-2`}>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-900 dark:text-zinc-100">
              Distribuído aos sócios no período
            </span>
            <span className="block text-[11px] text-slate-400 dark:text-zinc-500">
              Destinação de lucro, não custo — sai do caixa mas não entra na margem
            </span>
          </span>
          <span className="shrink-0 text-lg font-bold tabular-nums text-amber-500 dark:text-amber-400">
            {brl(totais.distribuido)}
          </span>
        </div>
      )}

      {totais.semCategoriaQtd > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong>{totais.semCategoriaQtd} lançamentos sem categoria</strong> no
          período ({brl(totais.semCategoriaValor)}). Eles entram no resultado pelo
          sentido do lançamento — entrada vira receita, saída vira despesa — o que
          pode estar inflando os dois lados.
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Painel
          eyebrow="Evolução mensal"
          titulo="Entradas vs Saídas"
          extra={`últimos ${MESES_GRAFICO} meses`}
        >
          <EntradasSaidasChart
            data={mensal.map((m) => ({
              label: m.label,
              faturamento: m.faturamento,
              despesa: m.despesa,
              parcial: m.parcial,
            }))}
          />
        </Painel>

        <Painel
          eyebrow="Fluxo de caixa"
          titulo="Resultado mensal"
          extra={`últimos ${MESES_GRAFICO} meses`}
        >
          <ResultadoLinhaChart
            data={mensal.map((m) => ({
              label: m.label,
              resultado: m.resultado,
              parcial: m.parcial,
            }))}
          />
        </Painel>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Painel eyebrow="Composição" titulo="Top fontes de receita" extra="% do faturamento">
          <ListaFatias fatias={fontes} vazio="Nenhuma receita no período." />
        </Painel>

        <Painel
          eyebrow="Para onde vai o dinheiro"
          titulo="Despesas por categoria"
          extra="% da despesa"
        >
          <ListaFatias fatias={destinos} vazio="Nenhuma despesa no período." />
        </Painel>
      </div>

      <p className="mt-6 text-xs text-slate-400 dark:text-zinc-500">
        Espelho da conta PJ do Banco Inter (sync a cada ~30 min). Cada lançamento
        recebe um papel contábil por regra de classificação: receita, custo
        variável, despesa operacional, distribuição ou neutro. Distribuição aos
        sócios e transferência entre contas próprias{" "}
        <strong>não entram no resultado</strong> — pagar sócio não é custo de
        operar. Veja o extrato completo em{" "}
        <Link href="/financeiro" className="underline">
          Financeiro
        </Link>
        .
      </p>
    </div>
  );
}
