"use client";

// Gráfico do Custo do WhatsApp: gasto por dia, empilhado por categoria
// (marketing, atendimento, utilidade, autenticação), em reais.

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORIAS, brl2, type LinhaDia } from "@/lib/custos-whatsapp";

function Amostra({ cor }: { cor: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: cor }} />;
}

export function LegendaCategorias() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {CATEGORIAS.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1.5">
          <Amostra cor={c.cor} />
          {c.nome}
        </span>
      ))}
    </div>
  );
}

function Dica({ active, payload }: { active?: boolean; payload?: { payload?: LinhaDia }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm min-w-44">
      <div className="mb-1 font-semibold text-ink">{d.rotulo}</div>
      {CATEGORIAS.filter((c) => d[c.key] > 0).map((c) => (
        <div key={c.key} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <Amostra cor={c.cor} />
            {c.nome}
          </span>
          <span className="font-medium tabular-nums text-ink">{brl2(d[c.key])}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between gap-4 border-t border-line pt-1 text-ink-2">
        <span>Total · {d.mensagens.toLocaleString("pt-BR")} cobradas</span>
        <span className="font-semibold tabular-nums text-ink">{brl2(d.total)}</span>
      </div>
    </div>
  );
}

export function GastoPorDiaChart({ data }: { data: LinhaDia[] }) {
  if (data.every((d) => d.total === 0)) {
    return <p className="py-10 text-center text-sm text-ink-2">Sem custo no período.</p>;
  }
  return (
    <div className="space-y-3">
      <LegendaCategorias />
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} tickLine={false} minTickGap={8} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => `R$ ${Math.round(v)}`}
          />
          <Tooltip content={<Dica />} cursor={{ fill: "rgba(100,116,139,0.08)" }} />
          {CATEGORIAS.map((c, i) => (
            <Bar
              key={c.key}
              dataKey={c.key}
              name={c.nome}
              stackId="d"
              fill={c.cor}
              stroke="var(--surface)"
              strokeWidth={1}
              maxBarSize={36}
              radius={i === CATEGORIAS.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
