"use client";

import { useEffect, useRef, useState } from "react";
import type { ProvisaoDia } from "@/lib/provisao-caixa";
import { brl } from "@/lib/format";

// Linha do tempo de liberação (SVG desenhado à mão, sem lib de chart).
// Barras verdes sólidas = pago, aguardando liberar (creditDate exato da Eduzz).
// Barras âmbar tracejadas = a vencer (previsão). Eixo de tempo proporcional a
// partir de hoje (horizonte mínimo de 30 dias), grade semanal nas segundas,
// linha "hoje" e tooltip com o saldo acumulado até o dia.

interface Mark {
  dia: string;
  valor: number;
  cobrancas: number;
  items: { nome: string; produto: string; valor: number }[];
  pago: boolean;
}

const PAGO_COLOR = "#059669"; // emerald-600
const PREV_COLOR = "#d97706"; // amber-600
const H = 190;
const M_TOP = 30;
const M_BOT = 30;
const M_X = 12;
const BAR_W = 10;

const brlCurto = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const dataUTC = (iso: string) => new Date(`${iso}T12:00:00Z`);
const diffDias = (iso: string, hoje: string) =>
  Math.round((dataUTC(iso).getTime() - dataUTC(hoje).getTime()) / 86_400_000);

export function dayLabel(iso: string, hoje: string): string {
  const diff = diffDias(iso, hoje);
  const rel = diff <= 0 ? "hoje" : diff === 1 ? "amanhã" : `em ${diff} dias`;
  const dd = dataUTC(iso).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
  return `${dd.replace(".", "")} · ${rel}`;
}

function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`;
}

export function ProvisaoTimeline({
  pago,
  vencer,
  disponivel,
  hoje,
}: {
  pago: ProvisaoDia[];
  vencer: ProvisaoDia[];
  disponivel: number;
  hoje: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<Mark | null>(null);
  const [hoverX, setHoverX] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      const w = es[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const marks: Mark[] = [
    ...pago.map((d) => ({ ...d, pago: true })),
    ...vencer.map((d) => ({ ...d, pago: false })),
  ].filter((m) => m.valor > 0);

  if (marks.length === 0) return null;

  const innerW = width - M_X * 2;
  const innerH = H - M_TOP - M_BOT;
  const baseY = M_TOP + innerH;

  const ultimoDia = marks.reduce((a, m) => (m.dia > a ? m.dia : a), hoje);
  const totalDias = Math.max(diffDias(ultimoDia, hoje) + 1, 30);
  const xOf = (iso: string) => M_X + (diffDias(iso, hoje) / totalDias) * innerW;

  const maxValor = Math.max(...marks.map((m) => m.valor), 1);
  const hOf = (v: number) => Math.max((v / maxValor) * innerH, 4);

  // grade semanal: cada segunda-feira dentro do horizonte
  const segundas: string[] = [];
  {
    const d = dataUTC(hoje);
    const desloc = (8 - d.getUTCDay()) % 7 || 7; // próxima segunda
    d.setUTCDate(d.getUTCDate() + desloc);
    while (diffDias(d.toISOString().slice(0, 10), hoje) <= totalDias) {
      segundas.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 7);
    }
  }
  const semanaPx = (7 / totalDias) * innerW;
  const tickCada = semanaPx >= 46 ? 1 : 2;

  // rótulos de valor: do maior pro menor, pulando quem fica a <78px de um já posto
  const rotulados = new Set<string>();
  {
    const postos: number[] = [];
    for (const m of [...marks].sort((a, b) => b.valor - a.valor)) {
      const x = xOf(m.dia);
      if (postos.every((p) => Math.abs(p - x) >= 78)) {
        postos.push(x);
        rotulados.add(`${m.dia}|${m.pago}`);
      }
    }
  }

  // saldo acumulado até o dia do hover (ambas as séries, inclusive)
  const acumulado = (dia: string) =>
    disponivel + marks.filter((m) => m.dia <= dia).reduce((a, m) => a + m.valor, 0);
  const temPrevisaoAte = (dia: string) => marks.some((m) => !m.pago && m.dia <= dia);

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = e.clientX - rect.left;
    let best: Mark | null = null;
    let bestDist = Infinity;
    for (const m of marks) {
      const d = Math.abs(xOf(m.dia) - rx);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    setHover(best);
    if (best) setHoverX(xOf(best.dia));
  }

  const duasSeries = pago.length > 0 && vencer.some((d) => d.valor > 0);

  return (
    <div ref={wrapRef} className="relative">
      <svg width={width} height={H} className="block">
        {/* grade semanal */}
        {segundas.map((s, i) => (
          <g key={s}>
            <line
              x1={xOf(s)}
              y1={M_TOP - 6}
              x2={xOf(s)}
              y2={baseY}
              className="stroke-slate-200 dark:stroke-white/[0.06]"
              strokeWidth={1}
            />
            {i % tickCada === 0 && xOf(s) - xOf(hoje) > 30 && (
              <text
                x={xOf(s)}
                y={baseY + 16}
                textAnchor="middle"
                fontSize={10}
                className="fill-slate-400 dark:fill-zinc-500"
              >
                {dataUTC(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}
              </text>
            )}
          </g>
        ))}

        {/* linha base */}
        <line
          x1={M_X}
          y1={baseY}
          x2={width - M_X}
          y2={baseY}
          className="stroke-slate-300 dark:stroke-white/15"
          strokeWidth={1}
        />

        {/* linha "hoje" */}
        <line
          x1={xOf(hoje)}
          y1={M_TOP - 10}
          x2={xOf(hoje)}
          y2={baseY}
          className="stroke-slate-400 dark:stroke-white/30"
          strokeWidth={1.5}
        />
        <text
          x={xOf(hoje) + 4}
          y={M_TOP - 14}
          fontSize={10}
          fontWeight={700}
          className="fill-slate-500 dark:fill-zinc-400"
        >
          hoje
        </text>

        {/* barras */}
        {marks.map((m) => {
          const mesmoDia = duasSeries && marks.some((o) => o.dia === m.dia && o.pago !== m.pago);
          const dx = mesmoDia ? (m.pago ? -6 : 6) : 0;
          const x = xOf(m.dia) - BAR_W / 2 + dx;
          const h = hOf(m.valor);
          const cor = m.pago ? PAGO_COLOR : PREV_COLOR;
          const tracejada = !m.pago;
          const ativa = hover?.dia === m.dia && hover?.pago === m.pago;
          return (
            <path
              key={`${m.dia}-${m.pago}`}
              d={topRoundedRect(x, baseY - h, BAR_W, h, 4)}
              fill={cor}
              fillOpacity={tracejada ? 0.4 : ativa ? 1 : 0.9}
              stroke={tracejada ? cor : undefined}
              strokeWidth={tracejada ? 1.5 : 0}
              strokeDasharray={tracejada ? "3 3" : undefined}
            />
          );
        })}

        {/* rótulos de valor */}
        {marks
          .filter((m) => rotulados.has(`${m.dia}|${m.pago}`))
          .map((m) => (
            <text
              key={`t-${m.dia}-${m.pago}`}
              x={xOf(m.dia)}
              y={baseY - hOf(m.valor) - 6}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              className="fill-slate-700 dark:fill-white/85 tabular-nums"
            >
              {brlCurto(m.valor)}
            </text>
          ))}

        {/* captura de hover */}
        <rect
          x={0}
          y={0}
          width={width}
          height={H}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {/* tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-60 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1d1628] p-3 shadow-xl"
          style={{
            left: Math.min(Math.max(hoverX - 120, 0), width - 244),
            top: 0,
          }}
        >
          <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
            {!hover.pago && "~ "}
            {dayLabel(hover.dia, hoje)}
          </div>
          <div
            className={`mt-0.5 text-sm font-bold tabular-nums ${hover.pago ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
          >
            {brl(hover.valor)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-zinc-500">
            {hover.pago ? "pago, a liberar" : "a vencer — previsão"} · {hover.cobrancas} cobrança
            {hover.cobrancas === 1 ? "" : "s"}
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {hover.items.slice(0, 4).map((it, i) => (
              <li key={i} className="flex justify-between gap-2 text-[11px]">
                <span className="truncate text-slate-600 dark:text-zinc-400">{it.nome.split(" ")[0]} · {it.produto}</span>
                <span className="shrink-0 tabular-nums text-slate-700 dark:text-zinc-300">{brlCurto(it.valor)}</span>
              </li>
            ))}
            {hover.items.length > 4 && (
              <li className="text-[11px] text-slate-400 dark:text-zinc-500">
                +{hover.items.length - 4} outras
              </li>
            )}
          </ul>
          <div className="mt-1.5 border-t border-slate-100 dark:border-white/[0.06] pt-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
            Saldo acumulado até aqui:{" "}
            <span className="font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
              {brl(acumulado(hover.dia))}
            </span>
            {temPrevisaoAte(hover.dia) && (
              <span className="text-amber-600 dark:text-amber-400"> (com previsão)</span>
            )}
          </div>
        </div>
      )}

      {/* legenda */}
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PAGO_COLOR }} />
          Pago, a liberar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm border border-dashed"
            style={{ borderColor: PREV_COLOR, background: `${PREV_COLOR}66` }}
          />
          A vencer — previsão
        </span>
      </div>
    </div>
  );
}
