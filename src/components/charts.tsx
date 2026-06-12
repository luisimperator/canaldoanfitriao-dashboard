"use client";

// Gráficos do dashboard (recharts roda no cliente).

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

export function SalesBySellerChart({
  data,
  sellers,
  stacked = false,
}: {
  data: Record<string, string | number>[]; // { month, [sellerName]: faturamento em R$ }
  sellers: string[];
  stacked?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} minTickGap={16} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
        <Tooltip formatter={brlTooltip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {sellers.map((name, i) => (
          <Bar
            key={name}
            dataKey={name}
            stackId={stacked ? "time" : undefined}
            fill={COLORS[i % COLORS.length]}
            radius={stacked && i < sellers.length - 1 ? [0, 0, 0, 0] : [3, 3, 0, 0]}
          />
        ))}
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
