"use client";

// Gráficos do dashboard (recharts roda no cliente).

import { Fragment } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#e11d48", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#64748b"];

const brlTooltip = (v: unknown) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function LeadsMqlChart({
  data,
}: {
  data: { date: string; leads: number; mql: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={32} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="leads"
          name="Leads/dia"
          stroke="#94a3b8"
          strokeWidth={1.5}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="mql"
          name="MQL/dia (com vendedor)"
          stroke="#e11d48"
          strokeWidth={2.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LeadsTrendChart({
  data,
}: {
  data: { date: string; leads: number; media7d: number | null }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={32} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="leads"
          name="Leads/dia"
          stroke="#94a3b8"
          strokeWidth={1.5}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="media7d"
          name="Média 7 dias"
          stroke="#e11d48"
          strokeWidth={2.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Tooltip do faturamento por vendedor: realizado e, no mês corrente,
// o total projetado pelo ritmo (realizado + projeção).
function SellerTooltip({
  active,
  payload,
  label,
  sellers,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | string }[];
  label?: string;
  sellers?: string[];
}) {
  if (!active || !payload?.length || !sellers) return null;
  const rows = sellers
    .map((name, i) => {
      const real = Number(payload.find((p) => p.dataKey === name)?.value ?? 0);
      const gap = Number(payload.find((p) => p.dataKey === `${name}__proj`)?.value ?? 0);
      return { name, real, gap, color: COLORS[i % COLORS.length] };
    })
    .filter((r) => r.real > 0 || r.gap > 0);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-semibold text-slate-900 mb-1">{label}</div>
      {rows.map((r) => (
        <div key={r.name} className="text-slate-600">
          <span style={{ color: r.color }}>●</span> {r.name}:{" "}
          <span className="font-medium text-slate-900">{brlTooltip(r.real)}</span>
          {r.gap > 0 && (
            <span className="text-slate-400"> → proj. {brlTooltip(r.real + r.gap)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function SalesBySellerChart({
  data,
  sellers,
  projected = false,
}: {
  data: Record<string, string | number>[]; // { month, [seller]: R$, [seller]__proj: R$ }
  sellers: string[];
  projected?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} minTickGap={16} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
        <Tooltip
          content={<SellerTooltip sellers={sellers} />}
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {sellers.map((name, i) => (
          <Fragment key={name}>
            <Bar
              dataKey={name}
              stackId={name}
              fill={COLORS[i % COLORS.length]}
              radius={[3, 3, 0, 0]}
            />
            {projected && (
              <Bar
                dataKey={`${name}__proj`}
                stackId={name}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={0.3}
                radius={[3, 3, 0, 0]}
                legendType="none"
              />
            )}
          </Fragment>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Tooltip do gráfico do time: em meses fechados mostra só o realizado;
// no mês corrente mostra o realizado e o total projetado pelo ritmo.
function TeamTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const realizado = Number(payload.find((p) => p.dataKey === "realizado")?.value ?? 0);
  const gap = Number(payload.find((p) => p.dataKey === "projecao")?.value ?? 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-semibold text-slate-900 mb-1">{label}</div>
      <div className="text-slate-600">
        Realizado: <span className="font-medium text-slate-900">{brlTooltip(realizado)}</span>
      </div>
      {gap > 0 && (
        <div className="mt-0.5 text-rose-400">
          Projetado p/ fim do mês:{" "}
          <span className="font-medium">{brlTooltip(realizado + gap)}</span>
        </div>
      )}
    </div>
  );
}

export function TeamHistoryChart({
  data,
}: {
  data: { month: string; realizado: number; projecao: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} minTickGap={16} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
        <Tooltip content={<TeamTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="realizado" name="Faturamento" stackId="t" fill="#e11d48" />
        <Bar
          dataKey="projecao"
          name="Projeção fim do mês (mês atual)"
          stackId="t"
          fill="#fecdd3"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CashflowChart({
  data,
}: {
  data: { month: string; entradas: number; saidas: number; resultado: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
        <Tooltip formatter={brlTooltip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="entradas" name="Entradas" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="saidas" name="Saídas" fill="#e11d48" radius={[3, 3, 0, 0]} />
        <Line type="monotone" dataKey="resultado" name="Resultado" stroke="#0f172a" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Investimento vs faturamento (barras, eixo R$) e ROAS (linha, eixo da direita)
// por mês. ROAS é blended (faturamento total ÷ investimento).
export function CacRoasChart({
  data,
}: {
  data: { month: string; investimento: number; faturamento: number; roas: number | null }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} minTickGap={16} />
        <YAxis
          yAxisId="money"
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
        />
        <YAxis
          yAxisId="roas"
          orientation="right"
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${Number(v).toFixed(0)}x`}
        />
        <Tooltip
          formatter={(v, n) =>
            n === "ROAS" ? `${Number(v).toFixed(2)}x` : brlTooltip(v)
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="money" dataKey="investimento" name="Investimento" fill="#e11d48" radius={[3, 3, 0, 0]} />
        <Bar yAxisId="money" dataKey="faturamento" name="Faturamento" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Line yAxisId="roas" type="monotone" dataKey="roas" name="ROAS" stroke="#0f172a" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Barras simples reutilizável (contagem ou R$).
export function BarsChart({
  data,
  xKey,
  barKey,
  name,
  color = "#2dd4bf",
  money = false,
  height = 260,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  barKey: string;
  name: string;
  color?: string;
  money?: boolean;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} minTickGap={8} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={money ? (v) => `${Math.round(Number(v) / 1000)}k` : undefined}
          allowDecimals={false}
        />
        <Tooltip
          formatter={money ? brlTooltip : undefined}
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
        />
        <Bar dataKey={barKey} name={name} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SourcePie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SpendByCategoryChart({
  data,
}: {
  data: { category: string; total: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
        <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={170} />
        <Tooltip formatter={brlTooltip} />
        <Bar dataKey="total" name="Total" fill="#e11d48" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
