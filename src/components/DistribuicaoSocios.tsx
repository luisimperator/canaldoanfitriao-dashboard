import { Card } from "@/components/ui";
import { brl, monthLabel } from "@/lib/format";
import type { DistribData } from "@/lib/distribuicao";

export function DistribuicaoSocios({ data }: { data: DistribData }) {
  const { caixa, projecoes, historico } = data;

  return (
    <Card title="Distribuição dos sócios — Fernando 40% · Rômulo 60%" className="lg:col-span-2">
      <p className="text-xs text-slate-500 mb-4">
        Fechamento todo dia 10 sobre o caixa do ciclo. Caixa atual estimado:{" "}
        <strong className="text-slate-700">{brl(caixa)}</strong> (capital de giro mantido).
        Projeção = receita do ciclo − custos do ciclo, aplicando os 40/60.
      </p>

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        {projecoes.map((p, i) => (
          <div
            key={p.fechamento}
            className={`rounded-xl border p-4 ${i === 0 ? "border-rose-200 bg-rose-50/40" : "border-slate-200"}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fechamento {p.label}
              </span>
              {i === 0 && (
                <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                  próximo
                </span>
              )}
            </div>
            <div className="mt-2">
              <div className="text-[11px] text-slate-400">Fernando recebe (40%)</div>
              <div className="text-2xl font-bold tabular-nums text-slate-900">{brl(p.fernando)}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Rômulo (60%): {brl(p.romulo)}</div>
            </div>

            <div className="mt-3 border-t border-slate-100 pt-2 space-y-1">
              {p.linhas.map((l) => (
                <div key={l.label} className="flex justify-between text-[11px]">
                  <span className="text-slate-500">{l.label}</span>
                  <span className={`tabular-nums ${l.tipo === "entrada" ? "text-emerald-600" : "text-rose-500"}`}>
                    {l.tipo === "entrada" ? "+" : "−"}
                    {brl(l.valor)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-[11px] font-semibold border-t border-slate-100 pt-1">
                <span className="text-slate-600">Caixa do ciclo</span>
                <span className="tabular-nums text-slate-800">{brl(p.cicloNet)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Histórico de distribuições
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="py-1.5 font-medium">Mês</th>
                <th className="py-1.5 font-medium text-right">Fernando</th>
                <th className="py-1.5 font-medium text-right">Rômulo (líq.)</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.mes} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 text-slate-600">{monthLabel(h.mes)}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-800 font-medium">
                    {h.fernando ? brl(h.fernando) : "—"}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums ${h.romulo < 0 ? "text-amber-600" : "text-slate-600"}`}>
                    {h.romulo ? brl(h.romulo) : "—"}
                    {h.romulo < 0 && <span className="block text-[10px] text-amber-500">injetou giro</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-[11px] text-slate-500 leading-relaxed">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Premissas (ajustáveis no código)
          </h3>
          <ul className="space-y-1 list-disc list-inside">
            <li>Boleto da Meta cai ~2 meses após o gasto (vence fim do mês seguinte ao fechado).</li>
            <li>Receita Eduzz usa o que já está agendado; quando falta venda, assume R$120k/ciclo (entressafra).</li>
            <li>
              Patrocínios do 4º Encontro (Stays, OwnerPro, Hostfully, EcoHost = R$40k) hoje no fechamento de
              julho — mova para o mês do evento se entrarem depois.
            </li>
            <li>Custos fixos: impostos R$30k + agências/folha R$20k por ciclo.</li>
            <li>Não inclui receita de ingressos/curso do evento (potencial de alta em Ago/Set).</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
