"use client";

import { useEffect, useRef, useState } from "react";
import { brl } from "@/lib/format";

// Curva de caixa projetada: saldo dia a dia (disponível + entradas previstas
// − saídas previstas), com barras de entrada, marcadores de saída, linha do
// dia do evento, "menor caixa" no vale e o fundo de caixa de 10%. É o gráfico
// de disrupção: se a linha encosta no fundo (ou fura o zero), tem aperto.

interface Fluxo {
  dia: string; // YYYY-MM-DD
  valor: number;
  /** rótulo pro detalhamento do tooltip (ex.: "Eduzz · 12 cobranças", "Boleto Facebook") */
  nome?: string;
}

const H = 260;
const M_TOP = 34;
const M_BOT = 34;
const M_X = 12;

const dataUTC = (iso: string) => new Date(`${iso}T12:00:00Z`);
const diffDias = (a: string, b: string) =>
  Math.round((dataUTC(a).getTime() - dataUTC(b).getTime()) / 86_400_000);
const addDias = (iso: string, n: number) => {
  const d = dataUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const kFmt = (v: number) =>
  Math.abs(v) >= 10_000
    ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function CashCurveChart({
  hoje,
  disponivel,
  entradas,
  saidas,
  evento,
}: {
  hoje: string;
  disponivel: number;
  entradas: Fluxo[];
  saidas: Fluxo[];
  evento?: { dia: string; label: string };
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);
  const [hoverDia, setHoverDia] = useState<string | null>(null);

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

  // horizonte: do hoje até o último fluxo (mínimo 30 dias)
  const ultimo = [...entradas, ...saidas].reduce((a, f) => (f.dia > a ? f.dia : a), hoje);
  const totalDias = Math.max(diffDias(ultimo, hoje) + 1, 30);

  const entradaDe = new Map<string, number>();
  for (const e of entradas) entradaDe.set(e.dia, (entradaDe.get(e.dia) ?? 0) + e.valor);
  const saidaDe = new Map<string, number>();
  for (const s of saidas) saidaDe.set(s.dia, (saidaDe.get(s.dia) ?? 0) + s.valor);

  // detalhamento nominal por dia (pro tooltip): entradas +, saídas −
  const fluxosDe = new Map<string, { nome: string; valor: number }[]>();
  for (const e of entradas) {
    if (!e.nome) continue;
    const l = fluxosDe.get(e.dia) ?? [];
    l.push({ nome: e.nome, valor: e.valor });
    fluxosDe.set(e.dia, l);
  }
  for (const s of saidas) {
    const l = fluxosDe.get(s.dia) ?? [];
    l.push({ nome: s.nome ?? "Saída programada", valor: -s.valor });
    fluxosDe.set(s.dia, l);
  }

  // série diária do saldo projetado
  const dias: { dia: string; saldo: number; entrada: number; saida: number }[] = [];
  let saldo = disponivel;
  for (let i = 0; i <= totalDias; i++) {
    const dia = addDias(hoje, i);
    const entrada = entradaDe.get(dia) ?? 0;
    const saida = saidaDe.get(dia) ?? 0;
    saldo += entrada - saida;
    dias.push({ dia, saldo, entrada, saida });
  }

  const fundo = Math.round(disponivel * 0.1);
  const menor = dias.reduce((a, d) => (d.saldo < a.saldo ? d : a), dias[0]);
  const maxSaldo = Math.max(...dias.map((d) => d.saldo), fundo);
  const minSaldo = Math.min(...dias.map((d) => d.saldo), 0);
  const maxEntrada = Math.max(...dias.map((d) => d.entrada), 1);

  const innerW = width - M_X * 2;
  const innerH = H - M_TOP - M_BOT;
  const span = maxSaldo - minSaldo || 1;
  const xOf = (dia: string) => M_X + (diffDias(dia, hoje) / totalDias) * innerW;
  const yOf = (v: number) => M_TOP + innerH - ((v - minSaldo) / span) * innerH;
  const baseY = M_TOP + innerH;

  const linha = dias.map((d, i) => `${i === 0 ? "M" : "L"} ${xOf(d.dia).toFixed(1)} ${yOf(d.saldo).toFixed(1)}`).join(" ");
  const area = `${linha} L ${xOf(dias[dias.length - 1].dia).toFixed(1)} ${baseY} L ${M_X} ${baseY} Z`;

  // segundas-feiras pro eixo
  const segundas: string[] = [];
  {
    const d = dataUTC(hoje);
    const desloc = (8 - d.getUTCDay()) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + desloc);
    while (diffDias(d.toISOString().slice(0, 10), hoje) <= totalDias) {
      segundas.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 7);
    }
  }
  const semanaPx = (7 / totalDias) * innerW;
  const tickCada = semanaPx >= 46 ? 1 : 2;

  // rótulos de fluxo (−saídas em rosa, +entradas grandes em verde), sem apinhar
  const marcas: { dia: string; texto: string; tipo: "saida" | "entrada" }[] = [];
  {
    const candidatos = dias
      .filter((d) => d.saida > 0 || d.entrada >= 0.55 * maxEntrada)
      .map((d) =>
        d.saida > 0
          ? { dia: d.dia, texto: `-${kFmt(d.saida)}`, tipo: "saida" as const, peso: d.saida }
          : { dia: d.dia, texto: `+${kFmt(d.entrada)}`, tipo: "entrada" as const, peso: d.entrada }
      )
      .sort((a, b) => b.peso - a.peso);
    const postos: number[] = [];
    for (const c of candidatos) {
      const x = xOf(c.dia);
      if (postos.every((p) => Math.abs(p - x) >= 62)) {
        postos.push(x);
        marcas.push(c);
      }
    }
  }

  const hover = hoverDia ? dias.find((d) => d.dia === hoverDia) : null;

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = e.clientX - rect.left;
    const i = Math.max(0, Math.min(totalDias, Math.round(((rx - M_X) / innerW) * totalDias)));
    setHoverDia(dias[i]?.dia ?? null);
  }

  const mostraEvento = evento && evento.dia >= hoje && diffDias(evento.dia, hoje) <= totalDias;

  return (
    <div ref={wrapRef} className="relative">
      <svg width={width} height={H} className="block">
        <defs>
          <linearGradient id="ccg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#059669" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* grade semanal + eixo */}
        {segundas.map((s, i) => (
          <g key={s}>
            <line x1={xOf(s)} y1={M_TOP - 4} x2={xOf(s)} y2={baseY} className="stroke-slate-200 dark:stroke-white/[0.06]" strokeWidth={1} />
            {i % tickCada === 0 && (
              <text x={xOf(s)} y={baseY + 16} textAnchor="middle" fontSize={10} className="fill-slate-400 dark:fill-zinc-500">
                {dataUTC(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}
              </text>
            )}
          </g>
        ))}
        <text x={M_X} y={baseY + 16} fontSize={10} fontWeight={700} className="fill-slate-500 dark:fill-zinc-400">
          hoje
        </text>

        {/* zero (só se o saldo fura) */}
        {minSaldo < 0 && (
          <line x1={M_X} y1={yOf(0)} x2={width - M_X} y2={yOf(0)} stroke="#e11d48" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
        )}

        {/* fundo de caixa 10% */}
        <line x1={M_X} y1={yOf(fundo)} x2={width - M_X} y2={yOf(fundo)} stroke="#d97706" strokeWidth={1} strokeDasharray="5 4" opacity={0.8} />
        <text x={width - M_X - 4} y={yOf(fundo) - 5} textAnchor="end" fontSize={10} fontWeight={600} className="fill-amber-600 dark:fill-amber-400">
          fundo 10% · {brl(fundo)}
        </text>

        {/* barras de entrada (na base) */}
        {dias.filter((d) => d.entrada > 0).map((d) => {
          const h = Math.max((d.entrada / maxEntrada) * 34, 2);
          return (
            <rect key={`e-${d.dia}`} x={xOf(d.dia) - 2} y={baseY - h} width={4} height={h} fill="#059669" opacity={0.45} rx={1} />
          );
        })}

        {/* dia do evento */}
        {mostraEvento && (
          <g>
            <line x1={xOf(evento.dia)} y1={M_TOP - 12} x2={xOf(evento.dia)} y2={baseY} stroke="#8b5cf6" strokeWidth={1.2} strokeDasharray="5 4" />
            <text x={xOf(evento.dia) + 4} y={M_TOP - 16} fontSize={10} fontWeight={700} className="fill-violet-600 dark:fill-violet-400">
              {evento.label}
            </text>
          </g>
        )}

        {/* área + linha do saldo */}
        <path d={area} fill="url(#ccg)" />
        <path d={linha} fill="none" stroke="#10b981" strokeWidth={2.2} strokeLinejoin="round" />

        {/* marcadores de saída (pontos na curva) */}
        {dias.filter((d) => d.saida > 0).map((d) => (
          <circle key={`s-${d.dia}`} cx={xOf(d.dia)} cy={yOf(d.saldo)} r={4} fill="#fb7185" stroke="#be123c" strokeWidth={1} />
        ))}

        {/* rótulos de fluxo */}
        {marcas.map((m) => {
          const d = dias.find((x) => x.dia === m.dia)!;
          return (
            <text
              key={`m-${m.dia}`}
              x={xOf(m.dia)}
              y={yOf(d.saldo) - 10}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={700}
              className={m.tipo === "saida" ? "fill-rose-600 dark:fill-rose-400" : "fill-emerald-600 dark:fill-emerald-400"}
            >
              {m.texto}
            </text>
          );
        })}

        {/* menor caixa */}
        <g>
          <circle cx={xOf(menor.dia)} cy={yOf(menor.saldo)} r={5} fill="none" stroke="#d97706" strokeWidth={1.5} strokeDasharray="2 2" />
          <text
            x={Math.min(Math.max(xOf(menor.dia) + 8, 70), width - 190)}
            y={yOf(menor.saldo) + 22}
            fontSize={11}
            fontWeight={700}
            className="fill-amber-600 dark:fill-amber-400"
          >
            menor caixa · {brl(menor.saldo)} ({dataUTC(menor.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })})
          </text>
        </g>

        <rect x={0} y={0} width={width} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHoverDia(null)} />
        {hover && (
          <line x1={xOf(hover.dia)} y1={M_TOP} x2={xOf(hover.dia)} y2={baseY} className="stroke-slate-300 dark:stroke-white/20" strokeWidth={1} />
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1d1628] p-3 shadow-xl"
          style={{ left: Math.min(Math.max(xOf(hover.dia) - 112, 0), width - 228), top: 0 }}
        >
          <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
            {dataUTC(hover.dia).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).replace(".", "")}
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {brl(hover.saldo)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-zinc-500">saldo projetado no fim do dia</div>
          {(fluxosDe.get(hover.dia) ?? []).length > 0 && (
            <ul className="mt-1.5 space-y-0.5 border-t border-slate-100 dark:border-white/[0.06] pt-1.5">
              {(fluxosDe.get(hover.dia) ?? [])
                .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
                .slice(0, 6)
                .map((f, i) => (
                  <li key={i} className="flex justify-between gap-2 text-[11px]">
                    <span className="truncate text-slate-600 dark:text-zinc-400">{f.nome}</span>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${f.valor >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                    >
                      {f.valor >= 0 ? "+" : "−"} {brl(Math.abs(f.valor))}
                    </span>
                  </li>
                ))}
              {(fluxosDe.get(hover.dia) ?? []).length > 6 && (
                <li className="text-[11px] text-slate-400 dark:text-zinc-500">
                  +{(fluxosDe.get(hover.dia) ?? []).length - 6} outros
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: "#10b981" }} /> Saldo projetado</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-1.5 rounded-sm" style={{ background: "#059669", opacity: 0.5 }} /> Entradas previstas</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#fb7185" }} /> Saída programada</span>
        {mostraEvento && (
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: "#8b5cf6" }} /> {evento.label} ({dataUTC(evento.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })})</span>
        )}
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded border-t border-dashed" style={{ borderColor: "#d97706" }} /> Fundo de caixa 10%</span>
      </div>
    </div>
  );
}
