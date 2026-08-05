"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Seletor de período em granularidade de MÊS, para a Visão geral financeira.
//
// O DateRangePicker (dia/semana/mês, com calendário) continua nas telas onde o
// recorte diário importa — funil, vendas, CAC. Aqui não: o DRE é mensal, e
// escolher "12 a 27 de março" só produz um resultado que não fecha com nada.
// Por isso este menu só fala em meses, trimestres e anos.
//
// Grava ?from=YYYY-MM-DD&to=YYYY-MM-DD (mesmo contrato das outras telas): o
// primeiro dia do mês inicial e o último dia do mês final.

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const pad = (n: number) => String(n).padStart(2, "0");
/** último dia do mês (28/29/30/31) */
const ultimoDia = (y: number, m: number) => new Date(y, m, 0).getDate();

/** "2026-08-04" → "Ago/26" */
function rotuloMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MESES[m - 1]}/${String(y).slice(2)}`;
}
function rotulo(from: string, to: string): string {
  const a = rotuloMes(from);
  const b = rotuloMes(to);
  return a === b ? a : `${a} – ${b}`;
}

export function PeriodoMenu({
  minYear = 2020,
  placeholder = "Este mês",
}: {
  /** ano em que "Todo o histórico" começa */
  minYear?: number;
  /** rótulo quando não há from/to na URL (o padrão da página) */
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const from = sp.get("from");
  const to = sp.get("to");
  const atual = from && to ? rotulo(from, to) : placeholder;

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /** de/até em "YYYY-MM" → URL com o mês inteiro coberto */
  function navegar(deYM: string, ateYM: string) {
    const [ay, am] = ateYM.split("-").map(Number);
    const p = new URLSearchParams(sp.toString());
    p.set("from", `${deYM}-01`);
    p.set("to", `${ateYM}-${pad(ultimoDia(ay, am))}`);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
    setOpen(false);
  }

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  const ymAtual = `${anoAtual}-${pad(mesAtual)}`;

  function atalho(
    p: "esteMes" | "mesPassado" | "u3" | "u6" | "u12" | "ano" | "tudo"
  ) {
    if (p === "esteMes") return navegar(ymAtual, ymAtual);
    if (p === "mesPassado") {
      let m = mesAtual - 1;
      let y = anoAtual;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
      const ym = `${y}-${pad(m)}`;
      return navegar(ym, ym);
    }
    if (p === "u3" || p === "u6" || p === "u12") {
      const n = p === "u3" ? 3 : p === "u6" ? 6 : 12;
      let y = anoAtual;
      let m = mesAtual - (n - 1);
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      return navegar(`${y}-${pad(m)}`, ymAtual);
    }
    if (p === "ano") return navegar(`${anoAtual}-01`, ymAtual);
    return navegar(`${minYear}-01`, ymAtual);
  }

  const anos = [anoAtual, anoAtual - 1, anoAtual - 2];

  const secao =
    "px-1 mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500";
  const item =
    "text-left px-2 py-1.5 rounded text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors";
  const itemForte =
    "text-left px-2 py-1.5 rounded font-medium text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors";
  const campo =
    "rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1 text-xs text-slate-700 dark:text-zinc-200";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] px-3 py-1.5 text-sm text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
      >
        <svg
          className="h-4 w-4 text-slate-400 dark:text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        {atual}
        <svg
          className={`h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] p-3 text-sm shadow-2xl">
          <p className={secao}>Atalhos</p>
          <div className="mb-3 grid grid-cols-2 gap-1">
            <button onClick={() => atalho("esteMes")} className={itemForte}>
              Este mês
            </button>
            <button onClick={() => atalho("mesPassado")} className={itemForte}>
              Mês passado
            </button>
            <button onClick={() => atalho("u3")} className={item}>
              Últimos 3 meses
            </button>
            <button onClick={() => atalho("u6")} className={item}>
              Últimos 6 meses
            </button>
            <button onClick={() => atalho("u12")} className={item}>
              Últimos 12 meses
            </button>
            <button onClick={() => atalho("ano")} className={item}>
              Ano até hoje
            </button>
            <button onClick={() => atalho("tudo")} className={`${item} col-span-2`}>
              Todo o histórico
            </button>
          </div>

          <p className={secao}>Por ano</p>
          <div className="mb-3 space-y-1">
            {anos.map((y) => (
              <div key={y} className="flex items-center gap-1">
                <button onClick={() => navegar(`${y}-01`, `${y}-12`)} className={`flex-1 ${item}`}>
                  {y}
                </button>
                {[1, 2, 3, 4].map((q) => (
                  <button
                    key={q}
                    onClick={() => navegar(`${y}-${pad((q - 1) * 3 + 1)}`, `${y}-${pad(q * 3)}`)}
                    className="rounded px-2 py-1.5 text-xs text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-600 dark:hover:text-zinc-300"
                  >
                    Q{q}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <p className={secao}>Mês específico</p>
          <MesUnico anoAtual={anoAtual} minYear={minYear} onPick={(ym) => navegar(ym, ym)} />

          <p className={`${secao} mt-3`}>Intervalo personalizado</p>
          <IntervaloCustom
            anoAtual={anoAtual}
            mesAtual={mesAtual}
            minYear={minYear}
            campo={campo}
            onAplicar={navegar}
          />
        </div>
      )}
    </div>
  );
}

/** Um clique: escolhe o ano na setinha, clica o mês, pronto. */
function MesUnico({
  anoAtual,
  minYear,
  onPick,
}: {
  anoAtual: number;
  minYear: number;
  onPick: (ym: string) => void;
}) {
  const [ano, setAno] = useState(anoAtual);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => setAno((y) => y - 1)}
          disabled={ano <= minYear}
          aria-label="Ano anterior"
          className="rounded px-2 py-0.5 text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-zinc-200 disabled:opacity-30"
        >
          ‹
        </button>
        <span className="text-sm font-medium tabular-nums text-slate-800 dark:text-zinc-200">
          {ano}
        </span>
        <button
          onClick={() => setAno((y) => Math.min(y + 1, anoAtual))}
          disabled={ano >= anoAtual}
          aria-label="Próximo ano"
          className="rounded px-2 py-0.5 text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-zinc-200 disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {MESES.map((m, i) => (
          <button
            key={m}
            onClick={() => onPick(`${ano}-${pad(i + 1)}`)}
            className="rounded px-2 py-1.5 text-xs text-slate-600 dark:text-zinc-400 hover:bg-violet-600 hover:text-white transition-colors"
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

function IntervaloCustom({
  anoAtual,
  mesAtual,
  minYear,
  campo,
  onAplicar,
}: {
  anoAtual: number;
  mesAtual: number;
  minYear: number;
  campo: string;
  onAplicar: (de: string, ate: string) => void;
}) {
  const [deM, setDeM] = useState(1);
  const [deY, setDeY] = useState(anoAtual);
  const [ateM, setAteM] = useState(mesAtual);
  const [ateY, setAteY] = useState(anoAtual);

  const anos: number[] = [];
  for (let y = anoAtual; y >= minYear; y--) anos.push(y);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-8 text-xs text-slate-400 dark:text-zinc-500">De</span>
        <select value={deM} onChange={(e) => setDeM(Number(e.target.value))} className={`flex-1 ${campo}`}>
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select value={deY} onChange={(e) => setDeY(Number(e.target.value))} className={`w-20 ${campo}`}>
          {anos.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-8 text-xs text-slate-400 dark:text-zinc-500">Até</span>
        <select value={ateM} onChange={(e) => setAteM(Number(e.target.value))} className={`flex-1 ${campo}`}>
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select value={ateY} onChange={(e) => setAteY(Number(e.target.value))} className={`w-20 ${campo}`}>
          {anos.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={() => {
          // Intervalo invertido (De Mai · Até Jan) mostrava um período vazio sem
          // dizer o porquê — troca as pontas em vez de falhar calado.
          const de = `${deY}-${pad(deM)}`;
          const ate = `${ateY}-${pad(ateM)}`;
          onAplicar(de <= ate ? de : ate, de <= ate ? ate : de);
        }}
        className="mt-1 w-full rounded bg-violet-600 py-1.5 text-xs font-medium text-white hover:bg-violet-500 transition-colors"
      >
        Aplicar
      </button>
    </div>
  );
}
