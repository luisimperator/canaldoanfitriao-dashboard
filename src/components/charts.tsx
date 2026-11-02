"use client";

// Gráficos do dashboard (recharts roda no cliente).

import { Fragment, useMemo, useState } from "react";
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
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  agrupar,
  agruparIntervalo,
  intervaloDaJanela,
  type Bucket,
  type Granularidade,
} from "@/lib/period-buckets";
import { DateRangePicker } from "@/components/DateRangePicker";

const COLORS = ["#e11d48", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#64748b"];

const brlTooltip = (v: unknown) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// Corrida até a meta: acumulado realizado (linha cheia), projeção no ritmo dos
// últimos 7 dias (tracejada), meta (pontilhada) e o dia do evento (vertical).
// Série única + extensões da mesma entidade — por isso tudo na cor da marca.
export function GoalPaceChart({
  data,
  goal,
  goalLabel,
  eventDate,
  eventLabel = "evento",
}: {
  data: { date: string; realizado: number | null; projecao: number | null }[];
  goal: number;
  goalLabel: string;
  eventDate?: string;
  eventLabel?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
        <YAxis
          tick={{ fontSize: 11 }}
          allowDecimals={false}
          domain={[0, Math.ceil((goal * 1.08) / 50) * 50]}
        />
        <Tooltip />
        <ReferenceLine
          y={goal}
          stroke="#94a3b8"
          strokeDasharray="2 5"
          label={{ value: goalLabel, position: "insideTopRight", fontSize: 11, fill: "#64748b" }}
        />
        {eventDate && (
          <ReferenceLine
            x={eventDate}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: eventLabel, position: "insideTopLeft", fontSize: 11, fill: "#b45309" }}
          />
        )}
        <Line
          type="monotone"
          dataKey="realizado"
          name="Vendidos (acumulado)"
          stroke="#e11d48"
          strokeWidth={2.5}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="projecao"
          name="Projeção (ritmo 7d)"
          stroke="#fb7185"
          strokeWidth={2}
          strokeDasharray="6 5"
          dot={false}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Leads e MQL por mês: barras (volume) + linha da taxa de qualificação no eixo
// da direita. O mês corrente aparece hachurado porque ainda está correndo —
// comparar ele com um mês fechado engana.
export function LeadsMqlMonthlyChart({
  data,
}: {
  data: { label: string; leads: number; mql: number; taxa: number | null; parcial: boolean }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="qtd" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis
          yAxisId="taxa"
          orientation="right"
          tick={{ fontSize: 11 }}
          unit="%"
          domain={[0, 100]}
        />
        <Tooltip
          formatter={(v, n) =>
            n === "Qualificação" ? `${Number(v).toFixed(1)}%` : v
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="qtd" dataKey="leads" name="Leads" fill="#94a3b8" radius={[3, 3, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.label} fillOpacity={d.parcial ? 0.45 : 1} />
          ))}
        </Bar>
        <Bar yAxisId="qtd" dataKey="mql" name="MQL" fill="#e11d48" radius={[3, 3, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.label} fillOpacity={d.parcial ? 0.45 : 1} />
          ))}
        </Bar>
        <Line
          yAxisId="taxa"
          type="monotone"
          dataKey="taxa"
          name="Qualificação"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
      </ComposedChart>
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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
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
    <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] px-3 py-2 text-xs shadow-sm">
      <div className="font-semibold text-slate-900 dark:text-zinc-100 mb-1">{label}</div>
      {rows.map((r) => (
        <div key={r.name} className="text-slate-600 dark:text-zinc-400">
          <span style={{ color: r.color }}>●</span> {r.name}:{" "}
          <span className="font-medium text-slate-900 dark:text-zinc-100">{brlTooltip(r.real)}</span>
          {r.gap > 0 && (
            <span className="text-slate-400 dark:text-zinc-500"> → proj. {brlTooltip(r.real + r.gap)}</span>
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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
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
    <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] px-3 py-2 text-xs shadow-sm">
      <div className="font-semibold text-slate-900 dark:text-zinc-100 mb-1">{label}</div>
      <div className="text-slate-600 dark:text-zinc-400">
        Realizado: <span className="font-medium text-slate-900 dark:text-zinc-100">{brlTooltip(realizado)}</span>
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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
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

export function SourcePie({
  data,
}: {
  data: { name: string; value: number; color?: string }[];
}) {
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
          {data.map((d, i) => (
            <Cell key={i} fill={d.color ?? COLORS[i % COLORS.length]} />
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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
        <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={170} />
        <Tooltip formatter={brlTooltip} />
        <Bar dataKey="total" name="Total" fill="#e11d48" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Faturamento do mês (barra) contra a distribuição que ele bancou no mês
// seguinte (barra) e a margem que sobrou disso (linha, eixo da direita).
// Mês ainda em aberto entra sem ponto na linha — margem null, não zero.
export function ReceitaDistribuicaoChart({
  data,
}: {
  data: { month: string; faturamento: number; distribuicao: number; margem: number | null }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} minTickGap={16} />
        <YAxis
          yAxisId="money"
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
        />
        <YAxis
          yAxisId="margem"
          orientation="right"
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${Math.round(Number(v))}%`}
        />
        <Tooltip
          formatter={(v, n) =>
            n === "Margem" ? `${Number(v).toFixed(1)}%` : brlTooltip(v)
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="money" dataKey="faturamento" name="Faturamento" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar
          yAxisId="money"
          dataKey="distribuicao"
          name="Distribuição (mês seguinte)"
          fill="#8b5cf6"
          radius={[3, 3, 0, 0]}
        />
        <Line
          yAxisId="margem"
          type="monotone"
          dataKey="margem"
          name="Margem"
          stroke="#0f172a"
          strokeWidth={2}
          connectNulls={false}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// MQL por dia / semana / mês / ano, com seletor de granularidade, de janela
// (últimos N períodos) e de datas exatas. O agrupamento roda aqui no cliente a
// partir da contagem diária, então trocar o botão não recarrega a página. O
// período corrente (ou cortado pelas datas) aparece mais claro. A janela vem de
// fora (PainelMqlOrigem), para a origem dos leads acompanhar o mesmo período.
const MQL_JANELAS: Record<Granularidade, { opcoes: number[]; padrao: number; unidade: string; plural: string }> = {
  dia: { opcoes: [1, 7, 14, 30, 90, 180, 365], padrao: 90, unidade: "dia", plural: "dias" },
  semana: { opcoes: [4, 8, 12, 24, 52, 104], padrao: 24, unidade: "semana", plural: "semanas" },
  mes: { opcoes: [3, 6, 12, 24, 36], padrao: 12, unidade: "mês", plural: "meses" },
  ano: { opcoes: [2, 3, 5], padrao: 3, unidade: "ano", plural: "anos" },
};
const MQL_GRANS: { key: Granularidade; label: string }[] = [
  { key: "dia", label: "Dia" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "ano", label: "Ano" },
];

export interface JanelaMql {
  gran: Granularidade;
  /** últimos N, guardado por granularidade */
  janelas: Record<Granularidade, number>;
  /** datas exatas escolhidas no calendário (sobrepõe os "últimos N") */
  datas: { from: string; to: string } | null;
}

export const JANELA_MQL_PADRAO: JanelaMql = {
  gran: "semana",
  janelas: {
    dia: MQL_JANELAS.dia.padrao,
    semana: MQL_JANELAS.semana.padrao,
    mes: MQL_JANELAS.mes.padrao,
    ano: MQL_JANELAS.ano.padrao,
  },
  datas: null,
};

/** Datas que a janela cobre: as escolhidas no calendário ou os últimos N períodos. */
export function intervaloDaJanelaMql(j: JanelaMql, hoje: string): { de: string; ate: string } {
  return j.datas ? { de: j.datas.from, ate: j.datas.to } : intervaloDaJanela(hoje, j.gran, j.janelas[j.gran]);
}

function Segmentos<T extends string | number>({
  opcoes,
  atual,
  onChange,
}: {
  opcoes: { key: T; label: string }[];
  atual: T | null;
  onChange: (k: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={atual === o.key}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            atual === o.key
              ? "bg-slate-900 dark:bg-violet-600 text-white"
              : "text-slate-500 dark:text-zinc-400 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MqlHistoryChart({
  porDia,
  hoje,
  faturamentoPorDia,
  janela,
  onJanela,
}: {
  porDia: Record<string, number>;
  hoje: string;
  /** faturamento das vendas com vendedor, por dia — sobreposição opcional */
  faturamentoPorDia?: Record<string, number>;
  janela: JanelaMql;
  onJanela: (j: JanelaMql) => void;
}) {
  const [comFaturamento, setComFaturamento] = useState(false);
  const gran = janela.gran;
  const cfg = MQL_JANELAS[gran];
  const n = janela.janelas[gran];
  const datas = janela.datas;
  const data = useMemo(() => {
    const agrupa = (m: Record<string, number>) =>
      datas ? agruparIntervalo(m, datas.from, datas.to, gran, hoje) : agrupar(m, hoje, gran, n);
    const mql = agrupa(porDia);
    // mesmos períodos, mesma ordem: casa por índice
    const fat = faturamentoPorDia ? agrupa(faturamentoPorDia) : null;
    return mql.map((b, i) => ({ ...b, faturamento: fat ? fat[i].valor : 0 }));
  }, [porDia, faturamentoPorDia, hoje, gran, n, datas]);
  const fechados = data.filter((d) => !d.parcial);
  const media = fechados.length ? fechados.reduce((a, d) => a + d.valor, 0) / fechados.length : 0;
  const total = data.reduce((a, d) => a + d.valor, 0);
  const totalFat = data.reduce((a, d) => a + d.faturamento, 0);
  const verFat = comFaturamento && Boolean(faturamentoPorDia);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Segmentos opcoes={MQL_GRANS} atual={gran} onChange={(g) => onJanela({ ...janela, gran: g })} />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 dark:text-zinc-400">últimos</span>
          <Segmentos
            opcoes={cfg.opcoes.map((o) => ({ key: o, label: String(o) }))}
            atual={datas ? null : n}
            onChange={(v) => onJanela({ ...janela, janelas: { ...janela.janelas, [gran]: v }, datas: null })}
          />
          <span className="text-xs text-slate-500 dark:text-zinc-400">
            {!datas && n === 1 ? cfg.unidade : cfg.plural}
          </span>
        </div>
        <DateRangePicker
          placeholder="Datas"
          minYear={2024}
          value={datas}
          onChange={(from, to) => onJanela({ ...janela, datas: { from, to } })}
        />
        {datas && (
          <button
            type="button"
            onClick={() => onJanela({ ...janela, datas: null })}
            className="text-xs text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 underline"
          >
            limpar datas
          </button>
        )}
        {faturamentoPorDia && (
          <button
            type="button"
            onClick={() => setComFaturamento((v) => !v)}
            aria-pressed={comFaturamento}
            className={`ml-auto inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              comFaturamento
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-800"
            }`}
          >
            <span
              className={`relative h-3.5 w-6 rounded-full transition-colors ${
                comFaturamento ? "bg-emerald-500" : "bg-slate-300 dark:bg-zinc-600"
              }`}
            >
              <span
                className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${
                  comFaturamento ? "left-3" : "left-0.5"
                }`}
              />
            </span>
            Faturamento do time
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-zinc-400 mb-3">
        {total.toLocaleString("pt-BR")} MQL no período
        {fechados.length > 0 && (
          <>
            {" "}
            · média {media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MQL/{cfg.unidade}
          </>
        )}
        {verFat && (
          <>
            {" "}
            · <span className="text-emerald-600 dark:text-emerald-400">{brlTooltip(totalFat)}</span> em
            vendas com vendedor
          </>
        )}
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: verFat ? 0 : 4, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={gran === "dia" || n > 30 ? 24 : 8} />
          <YAxis yAxisId="mql" tick={{ fontSize: 11 }} allowDecimals={false} />
          {verFat && (
            <YAxis
              yAxisId="fat"
              orientation="right"
              tick={{ fontSize: 11 }}
              width={52}
              tickFormatter={(v) =>
                Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(Math.round(Number(v)))
              }
            />
          )}
          <Tooltip
            cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.4 }}
            formatter={(v, name) => (name === "Faturamento do time" ? [brlTooltip(v), name] : [v, "MQL"])}
            labelFormatter={(_, p) => {
              const b = p?.[0]?.payload as Bucket | undefined;
              if (!b) return "";
              return b.parcial ? `${b.titulo} (em andamento)` : b.titulo;
            }}
          />
          <ReferenceLine yAxisId="mql" y={media} stroke="#94a3b8" strokeDasharray="4 4" />
          <Bar yAxisId="mql" dataKey="valor" name="MQL" fill="#e11d48" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fillOpacity={d.parcial ? 0.45 : 1} />
            ))}
          </Bar>
          {verFat && (
            <Line
              yAxisId="fat"
              type="monotone"
              dataKey="faturamento"
              name="Faturamento do time"
              stroke="#10b981"
              strokeWidth={2}
              dot={n <= 30 ? { r: 2.5 } : false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
