"use client";

// Partes do Painel Calls que rodam no navegador: o gráfico por dia (recharts)
// e os botões de corrigir a presença de uma call.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface DiaCalls {
  dia: string;
  rotulo: string;
  aconteceram: number;
  faltas: number;
  semResultado: number;
  agendadas: number;
}

// Cores em globals.css (--calls-*): azul × vermelho passam no teste de
// daltonismo; cinza = ainda sem resultado; agendada = só o contorno.
const SERIES = [
  { key: "aconteceram", nome: "Aconteceram", cor: "var(--calls-ok)" },
  { key: "faltas", nome: "Faltaram", cor: "var(--calls-falta)" },
  { key: "semResultado", nome: "Sem resultado ainda", cor: "var(--calls-espera)" },
  { key: "agendadas", nome: "Agendadas", cor: "transparent" },
] as const;

function Amostra({ k }: { k: (typeof SERIES)[number]["key"] }) {
  const s = SERIES.find((x) => x.key === k)!;
  return k === "agendadas" ? (
    <span className="inline-block h-2.5 w-2.5 rounded-[2px] border border-dashed border-slate-400 dark:border-zinc-500" />
  ) : (
    <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: s.cor }} />
  );
}

export function LegendaCalls({ mostrarAgendadas }: { mostrarAgendadas: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-zinc-400">
      {SERIES.filter((s) => mostrarAgendadas || s.key !== "agendadas").map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <Amostra k={s.key} />
          {s.nome}
        </span>
      ))}
    </div>
  );
}

function DicaDia({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: DiaCalls }[];
}) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  const apuradas = d.aconteceram + d.faltas;
  const linhas = SERIES.filter((s) => d[s.key] > 0);
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] px-3 py-2 text-xs shadow-sm min-w-40">
      <div className="font-semibold text-slate-900 dark:text-zinc-100 mb-1">{d.rotulo}</div>
      {linhas.length === 0 && <div className="text-slate-400 dark:text-zinc-500">Sem calls</div>}
      {linhas.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4 text-slate-600 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <Amostra k={s.key} />
            {s.nome}
          </span>
          <span className="font-medium tabular-nums text-slate-900 dark:text-zinc-100">{d[s.key]}</span>
        </div>
      ))}
      {apuradas > 0 && (
        <div className="mt-1 pt-1 border-t border-slate-100 dark:border-white/10 text-slate-600 dark:text-zinc-400">
          Comparecimento:{" "}
          <span className="font-semibold text-slate-900 dark:text-zinc-100">
            {Math.round((d.aconteceram / apuradas) * 100)}%
          </span>{" "}
          ({d.aconteceram}/{apuradas})
        </div>
      )}
    </div>
  );
}

export function CallsPorDiaChart({ data }: { data: DiaCalls[] }) {
  const temAgendadas = data.some((d) => d.agendadas > 0);
  return (
    <div>
      <div className="mb-3">
        <LegendaCalls mostrarAgendadas={temAgendadas} />
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} tickLine={false} minTickGap={8} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip content={<DicaDia />} cursor={{ fill: "rgba(100,116,139,0.08)" }} />
          <Bar dataKey="aconteceram" stackId="d" fill="var(--calls-ok)" maxBarSize={36} />
          <Bar dataKey="faltas" stackId="d" fill="var(--calls-falta)" maxBarSize={36} />
          <Bar dataKey="semResultado" stackId="d" fill="var(--calls-espera)" maxBarSize={36} />
          {temAgendadas && (
            <Bar
              dataKey="agendadas"
              stackId="d"
              fill="transparent"
              stroke="#94a3b8"
              strokeDasharray="3 2"
              maxBarSize={36}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const BTN =
  "rounded-md border border-slate-200 dark:border-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50";

// Corrige a presença na mão: vale sobre a gravação e a nota do vendedor.
// "Automático" tira a correção e volta pra régua (gravação ou nota #call).
export function PresencaBotoes({
  id,
  situacao,
  fonte,
}: {
  id: string;
  situacao: string;
  fonte: string | null;
}) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function marcar(presenca: "realizada" | "falta" | null) {
    setRodando(true);
    setErro(null);
    try {
      const res = await fetch("/api/calls/presenca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, presenca }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setErro(j.error ?? `Erro ${res.status}`);
      else router.refresh();
    } catch {
      setErro("Falha de rede");
    }
    setRodando(false);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {situacao !== "aconteceu" && (
        <button className={BTN} disabled={rodando} onClick={() => marcar("realizada")} title="Marcar que a call aconteceu">
          ✓ Aconteceu
        </button>
      )}
      {situacao !== "falta" && (
        <button className={BTN} disabled={rodando} onClick={() => marcar("falta")} title="Marcar que o lead faltou">
          ✗ Faltou
        </button>
      )}
      {fonte === "painel" && (
        <button
          className={BTN}
          disabled={rodando}
          onClick={() => marcar(null)}
          title="Tirar a correção e voltar pra gravação ou nota do vendedor"
        >
          ↺ Automático
        </button>
      )}
      {erro && <span className="text-[11px] text-rose-600 dark:text-rose-400">{erro}</span>}
    </span>
  );
}
