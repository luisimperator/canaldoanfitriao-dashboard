"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Seletor de período: atalhos + calendário com modo Dia / Semana / Mês +
// intervalo personalizado. Grava ?from=YYYY-MM-DD&to=YYYY-MM-DD na URL.

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DOW = ["D", "S", "T", "Q", "Q", "S", "S"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d || 1);
};
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function endOfWeek(d: Date) {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  return x;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtBR(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
function label(from: string, to: string): string {
  if (from === to) return fmtBR(from);
  const f = parse(from);
  const t = parse(to);
  // semana inteira (dom–sáb)?
  if (sameDay(startOfWeek(f), f) && sameDay(endOfWeek(f), t)) return `Semana de ${fmtBR(from)}`;
  // mês inteiro?
  const lastOfMonth = new Date(f.getFullYear(), f.getMonth() + 1, 0);
  if (f.getDate() === 1 && sameDay(t, lastOfMonth)) return `${MESES[f.getMonth()].toLowerCase()}/${String(f.getFullYear()).slice(2)}`;
  return `${fmtBR(from)} – ${fmtBR(to)}`;
}

export function DateRangePicker({ minYear = 2021 }: { minYear?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const now = new Date();
  const from = sp.get("from");
  const to = sp.get("to");
  const current = from && to ? label(from, to) : "Últimos 12 meses";

  const [mode, setMode] = useState<"dia" | "semana" | "mes">("dia");
  const [view, setView] = useState(() => (from ? parse(from) : now));
  const [cFrom, setCFrom] = useState(from ?? ymd(now));
  const [cTo, setCTo] = useState(to ?? ymd(now));

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function apply(f: string, t: string) {
    const p = new URLSearchParams(sp.toString());
    p.set("from", f);
    p.set("to", t);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
    setOpen(false);
  }
  function applyDays(f: Date, t: Date) {
    apply(ymd(f), ymd(t));
  }
  function clickDay(d: Date) {
    if (mode === "dia") applyDays(d, d);
    else if (mode === "semana") applyDays(startOfWeek(d), endOfWeek(d));
    else applyDays(new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  const presets: { label: string; f: Date; t: Date }[] = [
    { label: "Hoje", f: now, t: now },
    { label: "Ontem", f: addDays(now, -1), t: addDays(now, -1) },
    { label: "Esta semana", f: startOfWeek(now), t: endOfWeek(now) },
    { label: "Semana passada", f: startOfWeek(addDays(now, -7)), t: endOfWeek(addDays(now, -7)) },
    { label: "Últimos 7 dias", f: addDays(now, -6), t: now },
    { label: "Últimos 30 dias", f: addDays(now, -29), t: now },
    { label: "Este mês", f: new Date(now.getFullYear(), now.getMonth(), 1), t: now },
    { label: "Últimos 3 meses", f: addMonths(now, -3), t: now },
    { label: "Últimos 6 meses", f: addMonths(now, -6), t: now },
    { label: "Últimos 12 meses", f: addMonths(now, -12), t: now },
    { label: "Ano até hoje", f: new Date(now.getFullYear(), 0, 1), t: now },
    { label: "Todo o histórico", f: new Date(minYear, 0, 1), t: now },
  ];

  // grade do mês em exibição (6 semanas)
  const gridStart = startOfWeek(new Date(view.getFullYear(), view.getMonth(), 1));
  const grid: Date[] = [];
  for (let i = 0; i < 42; i++) grid.push(addDays(gridStart, i));

  function inSel(d: Date) {
    if (!from || !to) return false;
    const s = ymd(d);
    return s >= from && s <= to;
  }

  const sbtn = "rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 text-left transition-colors";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span className="text-slate-400">📅</span>
        {current}
        <span className="text-slate-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[19rem] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Atalhos</div>
          <div className="grid grid-cols-2 gap-1 mb-3">
            {presets.map((p) => (
              <button key={p.label} className={sbtn} onClick={() => applyDays(p.f, p.t)}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1">
              <button className="rounded px-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setView(addMonths(view, -1))}>
                ‹
              </button>
              <span className="text-xs font-semibold text-slate-700 w-24 text-center">
                {MESES[view.getMonth()]} {view.getFullYear()}
              </span>
              <button className="rounded px-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setView(addMonths(view, 1))}>
                ›
              </button>
            </div>
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
              {(["dia", "semana", "mes"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-2 py-0.5 text-[11px] capitalize ${mode === m ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                >
                  {m === "mes" ? "mês" : m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DOW.map((d, i) => (
              <div key={i} className="text-center text-[10px] text-slate-400">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-3">
            {grid.map((d, i) => {
              const isMonth = d.getMonth() === view.getMonth();
              const sel = inSel(d);
              return (
                <button
                  key={i}
                  onClick={() => clickDay(d)}
                  className={`h-7 rounded text-[11px] tabular-nums transition-colors ${
                    sel
                      ? "bg-rose-600 text-white"
                      : isMonth
                        ? "text-slate-700 hover:bg-slate-100"
                        : "text-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Intervalo personalizado</div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={cFrom}
              onChange={(e) => setCFrom(e.target.value)}
              className="flex-1 rounded border border-slate-200 px-1.5 py-1 text-xs"
            />
            <span className="text-xs text-slate-400">→</span>
            <input
              type="date"
              value={cTo}
              onChange={(e) => setCTo(e.target.value)}
              className="flex-1 rounded border border-slate-200 px-1.5 py-1 text-xs"
            />
            <button
              className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500"
              onClick={() => (cFrom <= cTo ? apply(cFrom, cTo) : apply(cTo, cFrom))}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
