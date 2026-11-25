"use client";

// Gráfico do Tráfego da Meta: por ciclo de cobrança, a fatura (com impostos;
// a do ciclo aberto é prevista) ao lado do faturamento do mesmo mês.

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface PontoCiclo {
  rotulo: string;
  fatura: number;
  faturamento: number;
  prevista: boolean;
}

const SERIES = [
  { key: "fatura", nome: "Fatura da Meta", cor: "var(--trafego-fatura)" },
  { key: "faturamento", nome: "Faturamento do mês", cor: "var(--trafego-faturamento)" },
] as const;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Dica({ active, payload }: { active?: boolean; payload?: { payload?: PontoCiclo }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm min-w-44">
      <div className="mb-1 font-semibold text-ink">{d.rotulo}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: s.cor }} />
            {s.nome}
            {s.key === "fatura" && d.prevista ? " (prevista)" : ""}
          </span>
          <span className="font-medium tabular-nums text-ink">{brl(d[s.key])}</span>
        </div>
      ))}
    </div>
  );
}

export function CiclosChart({ data }: { data: PontoCiclo[] }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: s.cor }} />
            {s.nome}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)} mil` : `${v}`)}
          />
          <Tooltip content={<Dica />} cursor={{ fill: "rgba(100,116,139,0.08)" }} />
          {SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.nome} fill={s.cor} maxBarSize={28} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
