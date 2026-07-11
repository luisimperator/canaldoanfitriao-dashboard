import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { getProjecao } from "@/lib/projecao";
import { brl } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { ProjectionChart } from "@/components/charts";

export const dynamic = "force-dynamic";

// Projeção financeira: caixa de hoje + 6 meses à frente em 3 cenários.
// Modelo em @/lib/projecao (média 6 meses fechados, piso no contratado Eduzz).

const mesLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
    .replace(".", "");
};

export default async function ProjecaoPage() {
  const data = await getDashboardData();
  const p = await getProjecao();

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Projeção financeira"
          subtitle="Caixa de hoje + 6 meses à frente, em 3 cenários"
        />
        <Link
          href="/financeiro"
          className="shrink-0 rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
        >
          ← Financeiro
        </Link>
      </div>
      <DemoBanner show={data.isDemo} />

      {!p ? (
        <Card title="Sem dados suficientes">
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            A projeção precisa do histórico do banco (sync do Inter) e das vendas da Eduzz.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
            <KpiCard label="Caixa hoje" value={brl(p.caixa)} tone={p.caixa >= 0 ? "good" : "bad"} />
            <KpiCard
              label="Entradas (média 6m)"
              value={brl(p.mediaEntradas)}
              hint={`saídas: ${brl(p.mediaSaidas)}/mês`}
            />
            <KpiCard
              label="Resultado médio/mês"
              value={brl(p.mediaEntradas - p.mediaSaidas)}
              tone={p.mediaEntradas - p.mediaSaidas >= 0 ? "good" : "warn"}
            />
            <KpiCard
              label="Já contratado (Eduzz)"
              value={brl(p.contratadoTotal)}
              hint="parcelas pagas a liberar"
              tone="good"
            />
          </div>

          <Card title="Saldo projetado — 6 meses" className="mb-4">
            <ProjectionChart
              data={p.meses.map((m) => ({
                mes: mesLabel(m.mes),
                cons: Math.round(m.saldoFim.cons),
                base: Math.round(m.saldoFim.base),
                otm: Math.round(m.saldoFim.otm),
              }))}
            />
            <p className="mt-2 text-xs text-slate-400 dark:text-zinc-500">
              Base = receita na média dos últimos 6 meses fechados · conservador −20% ·
              otimista +20%. Despesa igual à média nos três. Abaixo da linha pontilhada,
              o caixa fica negativo.
            </p>
          </Card>

          <Card title="Mês a mês (cenário base)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 dark:text-zinc-500">
                    <th className="py-1.5 font-medium">Mês</th>
                    <th className="py-1.5 font-medium text-right">Entradas</th>
                    <th className="py-1.5 font-medium text-right">— contratado Eduzz</th>
                    <th className="py-1.5 font-medium text-right">Saídas</th>
                    <th className="py-1.5 font-medium text-right">Resultado</th>
                    <th className="py-1.5 font-medium text-right">Saldo no fim</th>
                  </tr>
                </thead>
                <tbody>
                  {p.meses.map((m) => {
                    const resultado = m.entradas.base - m.saidas;
                    return (
                      <tr key={m.mes} className="border-t border-slate-100 dark:border-white/[0.06]">
                        <td className="py-1.5 text-slate-700 dark:text-zinc-300 capitalize">{mesLabel(m.mes)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-900 dark:text-zinc-100 font-semibold">
                          {brl(m.entradas.base)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500 dark:text-zinc-400">
                          {m.contratadoEduzz > 0 ? brl(m.contratadoEduzz) : "—"}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-700 dark:text-zinc-300">
                          {brl(m.saidas)}
                        </td>
                        <td
                          className={`py-1.5 text-right tabular-nums font-semibold ${
                            resultado >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {brl(resultado)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-semibold text-slate-900 dark:text-zinc-100">
                          {brl(m.saldoFim.base)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="mt-4 text-xs text-slate-400 dark:text-zinc-500">
            Premissas: o mês corrente usa o realizado até hoje + ritmo médio nos dias
            restantes; “contratado Eduzz” são parcelas já pagas com liberação futura
            (dinheiro certo — serve de piso da receita, não soma além da média). O modelo
            NÃO inclui lançamentos/eventos futuros que não estejam no padrão dos últimos 6
            meses — um lançamento forte joga tudo pra cima do otimista. Distribuições aos
            sócios contam como saída (estão na média).
          </p>
        </>
      )}
    </div>
  );
}
