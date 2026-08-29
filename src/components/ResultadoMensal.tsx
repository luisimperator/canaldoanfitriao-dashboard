import { brl, monthLabel } from "@/lib/format";
import { Card, KpiCard } from "@/components/ui";
import { ReceitaDistribuicaoChart } from "@/components/charts";
import { acumuladoFechado, type MesResultado } from "@/lib/resultado-mensal";

// Receita × distribuição × margem. Fica ACIMA do fluxo de caixa na tela porque
// é a pergunta que se faz primeiro; o extrato do Inter responde outra coisa
// (quando o dinheiro passou pela conta), não esta.

function pct(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`;
}

export function ResultadoMensal({ linhas }: { linhas: MesResultado[] }) {
  if (linhas.length === 0) return null;

  const acum = acumuladoFechado(linhas);
  const ultimoFechado = [...linhas].reverse().find((l) => l.fechado && l.faturamento > 0) ?? null;
  const mesAtual = linhas[linhas.length - 1];

  const grafico = linhas.map((l) => ({
    month: l.mes.slice(2), // "26-07"
    faturamento: Math.round(l.faturamento),
    distribuicao: Math.round(l.distribuicaoM1),
    margem: l.margem,
  }));

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <KpiCard
          label="Faturamento no mês"
          value={brl(mesAtual.faturamento)}
          hint={`${monthLabel(mesAtual.mes)} · parcial`}
          tone="good"
        />
        <KpiCard
          label="Distribuição no mês"
          value={brl(mesAtual.distribuicao)}
          hint="saiu do caixa neste mês"
        />
        <KpiCard
          label={ultimoFechado ? `Margem de ${monthLabel(ultimoFechado.mes)}` : "Margem"}
          value={ultimoFechado ? pct(ultimoFechado.margem) : "—"}
          hint={
            ultimoFechado
              ? `${brl(ultimoFechado.distribuicaoM1)} distribuídos no mês seguinte`
              : undefined
          }
        />
        <KpiCard
          label={`Margem acumulada (${acum.meses} meses)`}
          value={pct(acum.margem)}
          hint={`${brl(acum.distribuicao)} sobre ${brl(acum.faturamento)}`}
        />
      </div>

      <Card title="Faturamento, distribuição e margem">
        <ReceitaDistribuicaoChart data={grafico} />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                <th className="py-2 pr-3 font-medium">Mês</th>
                <th className="py-2 px-3 font-medium text-right">Faturamento</th>
                <th className="py-2 px-3 font-medium text-right">Distribuição no mês</th>
                <th className="py-2 px-3 font-medium text-right">Distribuição do mês seguinte</th>
                <th className="py-2 pl-3 font-medium text-right">Margem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {[...linhas].reverse().map((l) => (
                <tr key={l.mes}>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {monthLabel(l.mes)}
                    {!l.fechado && (
                      <span className="ml-2 rounded bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                        em aberto
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {brl(l.faturamento)}
                    {l.asaas > 0 && (
                      <span className="block text-[11px] text-slate-400 dark:text-zinc-500">
                        Eduzz {brl(l.eduzz)} · Asaas {brl(l.asaas)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-500 dark:text-zinc-400">
                    {l.distribuicao > 0 ? brl(l.distribuicao) : "—"}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {l.fechado ? (l.distribuicaoM1 > 0 ? brl(l.distribuicaoM1) : "—") : "a sair"}
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums font-semibold">
                    {pct(l.margem)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-400 dark:text-zinc-500">
          Faturamento = venda paga na data do pagamento (Eduzz por <code>paidAt</code>, Asaas por
          data de crédito) — é competência, não caixa; por isso não bate com “Entradas no mês” do
          extrato. A distribuição de um mês remunera o mês anterior, então a margem divide a
          distribuição do mês <strong>seguinte</strong> pelo faturamento do mês. Mês a mês ela
          oscila muito (a distribuição segue o caixa disponível, não o resultado exato); a margem
          acumulada é a que vale para decidir. E ela subestima o lucro: a política retém parte do
          caixa em vez de distribuir tudo.
        </p>
      </Card>
    </div>
  );
}
