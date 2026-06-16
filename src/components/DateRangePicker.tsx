"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Seletor de período rico (atalhos, trimestres, mês específico, intervalo
// personalizado). Grava ?from=YYYY-MM&to=YYYY-MM na URL; a página lê e filtra.
// Reutilizável em qualquer página com série mensal.

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function ym(y: number, m0: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}`;
}
function shift(y: number, m0: number, delta: number): { y: number; m0: number } {
  const d = new Date(y, m0 + delta, 1);
  return { y: d.getFullYear(), m0: d.getMonth() };
}
function label(from: string, to: string): string {
  const f = from.split("-").map(Number);
  const t = to.split("-").map(Number);
  const fmt = (a: number[]) => `${MESES[a[1] - 1].toLowerCase()}/${String(a[0]).slice(2)}`;
  return from === to ? fmt(f) : `${fmt(f)} – ${fmt(t)}`;
}

export function DateRangePicker({ minYear = 2021 }: { minYear?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const now = new Date();
  const curY = now.getFullYear();
  const curM0 = now.getMonth();
  const maxYear = curY;
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);

  const from = sp.get("from");
  const to = sp.get("to");
  const current = from && to ? label(from, to) : "Últimos 12 meses";

  const [gridYear, setGridYear] = useState(maxYear);
  const [cf, setCf] = useState({ y: curY, m0: 0 });
  const [ct, setCt] = useState({ y: curY, m0: curM0 });

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

  const presets: { label: string; f: string; t: string }[] = [
    { label: "Este mês", f: ym(curY, curM0), t: ym(curY, curM0) },
    {
      label: "Mês passado",
      f: ym(shift(curY, curM0, -1).y, shift(curY, curM0, -1).m0),
      t: ym(shift(curY, curM0, -1).y, shift(curY, curM0, -1).m0),
    },
    { label: "Últimos 3 meses", f: ym(shift(curY, curM0, -2).y, shift(curY, curM0, -2).m0), t: ym(curY, curM0) },
    { label: "Últimos 6 meses", f: ym(shift(curY, curM0, -5).y, shift(curY, curM0, -5).m0), t: ym(curY, curM0) },
    { label: "Últimos 12 meses", f: ym(shift(curY, curM0, -11).y, shift(curY, curM0, -11).m0), t: ym(curY, curM0) },
    { label: "Ano até hoje", f: ym(curY, 0), t: ym(curY, curM0) },
    { label: "Todo o histórico", f: ym(minYear, 0), t: ym(curY, curM0) },
  ];

  const btn = "rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 text-left transition-colors";
  const qbtn = "rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-800";

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
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Atalhos</div>
          <div className="grid grid-cols-2 gap-1 mb-3">
            {presets.map((p) => (
              <button key={p.label} className={btn} onClick={() => apply(p.f, p.t)}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Por ano</div>
          <div className="space-y-0.5 mb-3">
            {years.slice(0, 3).map((y) => (
              <div key={y} className="flex items-center justify-between">
                <button className={btn} onClick={() => apply(ym(y, 0), y === curY ? ym(curY, curM0) : ym(y, 11))}>
                  {y}
                </button>
                <div className="flex gap-0.5">
                  {[0, 1, 2, 3].map((q) => (
                    <button key={q} className={qbtn} onClick={() => apply(ym(y, q * 3), ym(y, q * 3 + 2))}>
                      Q{q + 1}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Mês específico</div>
          <div className="flex items-center justify-between mb-1">
            <button className={qbtn} onClick={() => setGridYear((y) => Math.max(minYear, y - 1))}>
              ‹
            </button>
            <span className="text-xs font-semibold text-slate-700">{gridYear}</span>
            <button className={qbtn} onClick={() => setGridYear((y) => Math.min(maxYear, y + 1))}>
              ›
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 mb-3">
            {MESES.map((mes, i) => (
              <button key={mes} className={`${btn} text-center`} onClick={() => apply(ym(gridYear, i), ym(gridYear, i))}>
                {mes}
              </button>
            ))}
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            Intervalo personalizado
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-7 text-xs text-slate-500">De</span>
              <select
                className="flex-1 rounded border border-slate-200 px-1 py-0.5 text-xs"
                value={cf.m0}
                onChange={(e) => setCf((s) => ({ ...s, m0: Number(e.target.value) }))}
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                value={cf.y}
                onChange={(e) => setCf((s) => ({ ...s, y: Number(e.target.value) }))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-7 text-xs text-slate-500">Até</span>
              <select
                className="flex-1 rounded border border-slate-200 px-1 py-0.5 text-xs"
                value={ct.m0}
                onChange={(e) => setCt((s) => ({ ...s, m0: Number(e.target.value) }))}
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                value={ct.y}
                onChange={(e) => setCt((s) => ({ ...s, y: Number(e.target.value) }))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="w-full rounded-md bg-rose-600 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
              onClick={() => {
                const f = ym(cf.y, cf.m0);
                const t = ym(ct.y, ct.m0);
                apply(f <= t ? f : t, f <= t ? t : f);
              }}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
