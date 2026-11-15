"use client";

// Mapa dos alunos: Brasil por estado (cor = quantos alunos) com as regiões de
// DDD em bolinhas; clique num estado pra dar zoom e ver as regiões e a lista
// de nomes. Na vista Mundo, os países (pelo código do telefone) com a mesma
// lógica. Filtros: alunos ou todos os clientes; ativos, ex-alunos ou todos;
// busca por nome. Claro e escuro pelas variáveis --mapa-* (globals.css).

import { useEffect, useMemo, useRef, useState } from "react";
import { ESTADOS, VIEWBOX, projetar } from "@/lib/mapa/brasil";
import { DDD } from "@/lib/mapa/ddd";
import { MUNDO_VIEWBOX, PAISES } from "@/lib/mapa/mundo";

export interface AlunoMapa {
  id: string;
  nome: string;
  uf: string | null;
  ddd: string | null;
  exterior: boolean;
  /** país (ISO, "BR" pro Brasil) ou null quando não deu pra saber */
  pais: string | null;
  cidade: string | null;
  curso: boolean;
  ativo: boolean;
  produtos: string | null;
}

type Publico = "alunos" | "todos";
type Vista = "brasil" | "mundo";
type Status = "todos" | "ativos" | "ex";
type Caixa = [number, number, number, number];

const NOME_UF = Object.fromEntries(ESTADOS.map((e) => [e.uf, e.nome]));
const BRASIL: Caixa = [-12, -12, VIEWBOX.w + 24, VIEWBOX.h + 24];
// arredondado: a conta em ponto flutuante dava diferente no servidor e no
// navegador e o React reclamava (hydration mismatch)
const PONTO = Object.fromEntries(
  Object.entries(DDD).map(([d, r]) => [d, projetar(r.lat, r.lon).map((v) => Math.round(v * 100) / 100) as [number, number]])
);
const MUNDO: Caixa = [-10, -10, MUNDO_VIEWBOX.w + 20, MUNDO_VIEWBOX.h + 20];
const PAIS = Object.fromEntries(PAISES.map((p) => [p.iso, p]));
// "??": telefone de fora do Brasil sem país identificado
const SEM_PAIS = "??";

function nomePais(iso: string): string {
  if (iso === SEM_PAIS) return "País não identificado";
  if (PAIS[iso]) return PAIS[iso].nome;
  try {
    return new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(iso) ?? iso;
  } catch {
    return iso;
  }
}

function caixaDoPais(iso: string): Caixa {
  const p = PAIS[iso];
  if (!p) return MUNDO;
  const [x0, y0, x1, y1] = p.bbox;
  const w = x1 - x0, h = y1 - y0;
  const lado = Math.max(w, h * (MUNDO_VIEWBOX.w / MUNDO_VIEWBOX.h)) * 1.6 + 40;
  const alto = lado * (MUNDO_VIEWBOX.h / MUNDO_VIEWBOX.w);
  return [x0 + w / 2 - lado / 2, y0 + h / 2 - alto / 2, lado, alto];
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmt = (n: number) => n.toLocaleString("pt-BR");

function caixaDoEstado(uf: string): Caixa {
  const e = ESTADOS.find((x) => x.uf === uf);
  if (!e) return BRASIL;
  const [x0, y0, x1, y1] = e.bbox;
  const w = x1 - x0, h = y1 - y0;
  // deixa o estado com folga e na proporção do quadro do mapa
  const lado = Math.max(w, h * (VIEWBOX.w / VIEWBOX.h)) * 1.35 + 20;
  const alto = lado * (VIEWBOX.h / VIEWBOX.w);
  return [x0 + w / 2 - lado / 2, y0 + h / 2 - alto / 2, lado, alto];
}

function useCaixaAnimada(alvo: Caixa): Caixa {
  const [caixa, setCaixa] = useState<Caixa>(alvo);
  const atual = useRef<Caixa>(alvo);
  useEffect(() => {
    const de = atual.current;
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();
    const passo = (t: number) => {
      const k = reduz ? 1 : Math.min(1, (t - t0) / 650);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const c = de.map((v, i) => v + (alvo[i] - v) * e) as Caixa;
      atual.current = c;
      setCaixa(c);
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo]);
  return caixa;
}

function Segmento<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full p-0.5 bg-[var(--mapa-chip)] border border-[var(--mapa-linha)] backdrop-blur">
      {opcoes.map(([v, r]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={valor === v}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            valor === v ? "bg-[var(--mapa-texto)] text-[var(--mapa-fundo)]" : "text-[var(--mapa-suave)] hover:text-[var(--mapa-texto)]"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export function MapaAlunos({ alunos }: { alunos: AlunoMapa[] }) {
  const [publico, setPublico] = useState<Publico>("alunos");
  const [status, setStatus] = useState<Status>("todos");
  const [vista, setVista] = useState<Vista>("brasil");
  const [pais, setPais] = useState<string | null>(null);
  const [uf, setUf] = useState<string | null>(null);
  const [ddd, setDdd] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [hover, setHover] = useState<{ uf: string; x: number; y: number; largura: number } | null>(null);
  const [hoverPais, setHoverPais] = useState<{ iso: string; x: number; y: number; largura: number } | null>(null);
  const [limite, setLimite] = useState(120);
  const quadro = useRef<HTMLDivElement>(null);

  const base = useMemo(
    () =>
      alunos.filter(
        (a) =>
          (publico === "todos" || a.curso) &&
          (status === "todos" || (publico === "alunos" || a.curso ? (status === "ativos" ? a.ativo : !a.ativo) : status === "ex"))
      ),
    [alunos, publico, status]
  );

  const porUf = useMemo(() => {
    const m = new Map<string, { total: number; ativos: number }>();
    for (const a of base) {
      if (!a.uf) continue;
      const v = m.get(a.uf) ?? { total: 0, ativos: 0 };
      v.total++;
      if (a.ativo) v.ativos++;
      m.set(a.uf, v);
    }
    return m;
  }, [base]);
  const porDdd = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of base) if (a.ddd && PONTO[a.ddd]) m.set(a.ddd, (m.get(a.ddd) ?? 0) + 1);
    return m;
  }, [base]);
  const porPais = useMemo(() => {
    const m = new Map<string, { total: number; ativos: number }>();
    for (const a of base) {
      const k = a.pais ?? (a.exterior ? SEM_PAIS : null);
      if (!k) continue;
      const v = m.get(k) ?? { total: 0, ativos: 0 };
      v.total++;
      if (a.ativo) v.ativos++;
      m.set(k, v);
    }
    return m;
  }, [base]);
  const maxPais = Math.max(1, ...[...porPais.entries()].filter(([k]) => k !== SEM_PAIS).map(([, v]) => v.total));
  const paises = [...porPais.keys()].filter((k) => k !== SEM_PAIS).length;
  const maxUf = Math.max(1, ...[...porUf.values()].map((v) => v.total));
  const maxDdd = Math.max(1, ...porDdd.values());
  const exterior = base.filter((a) => a.exterior).length;
  const semLugar = base.filter((a) => !a.uf && !a.exterior).length;
  const estados = porUf.size;
  // Os números do topo seguem a seleção: Brasil inteiro, um estado ou o exterior.
  const doPais = (a: AlunoMapa, k: string) => (k === SEM_PAIS ? a.exterior && !a.pais : a.pais === k);
  const escopo =
    vista === "mundo"
      ? pais
        ? base.filter((a) => doPais(a, pais))
        : base
      : uf === "EX"
        ? base.filter((a) => a.exterior)
        : uf
          ? base.filter((a) => a.uf === uf)
          : base;
  const ativos = escopo.filter((a) => a.ativo).length;

  const alvo = useMemo(() => (uf && uf !== "EX" ? caixaDoEstado(uf) : BRASIL), [uf]);
  const caixa = useCaixaAnimada(alvo);
  const zoom = VIEWBOX.w / caixa[2];
  const alvoMundo = useMemo(() => (pais && pais !== SEM_PAIS ? caixaDoPais(pais) : MUNDO), [pais]);
  const caixaMundo = useCaixaAnimada(alvoMundo);
  const zoomMundo = MUNDO_VIEWBOX.w / caixaMundo[2];

  const q = semAcento(busca.trim());
  const lista = useMemo(() => {
    const l = base.filter((a) => {
      if (vista === "mundo") {
        if (!pais || !doPais(a, pais)) return false;
        return !q || semAcento(`${a.nome} ${a.cidade ?? ""}`).includes(q);
      }
      if (uf === "EX") return a.exterior;
      if (uf && a.uf !== uf) return false;
      if (ddd && a.ddd !== ddd) return false;
      if (q && !semAcento(`${a.nome} ${a.cidade ?? ""}`).includes(q)) return false;
      return true;
    });
    return l.sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [base, uf, ddd, q, vista, pais]);

  const ranking = [...porUf.entries()].sort((a, b) => b[1].total - a[1].total);
  const rankingPaises = [...porPais.entries()].sort((a, b) => (a[0] === SEM_PAIS ? 1 : b[0] === SEM_PAIS ? -1 : b[1].total - a[1].total));
  const regioesDoUf = uf
    ? Object.entries(DDD)
        .filter(([d, r]) => r.uf === uf && porDdd.get(d))
        .map(([d, r]) => ({ d, r, n: porDdd.get(d) ?? 0 }))
        .sort((a, b) => b.n - a.n)
    : [];

  function escolheUf(novo: string | null) {
    setUf(novo);
    setDdd(null);
    setLimite(120);
  }

  function escolheVista(v: Vista) {
    setVista(v);
    setPais(null);
    setUf(null);
    setDdd(null);
    setHover(null);
    setHoverPais(null);
    setLimite(120);
  }

  function escolhePais(novo: string | null) {
    // Brasil abre o mapa do Brasil, com estados e DDDs
    if (novo === "BR") return escolheVista("brasil");
    setPais(novo);
    setHoverPais(null);
    setLimite(120);
  }

  const total = escopo.length;
  const rotuloPublico = publico === "alunos" ? "alunos" : "clientes";

  return (
    <div className="mapa-alunos rounded-2xl border border-[var(--mapa-linha)] bg-[var(--mapa-fundo)] text-[var(--mapa-texto)] shadow-sm overflow-hidden">
      {/* topo */}
      <div className="px-5 sm:px-7 pt-6 pb-5 border-b border-[var(--mapa-linha)] grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] items-end">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--mapa-suave)]">
            Canal do Anfitrião / {vista === "mundo" ? (pais ? nomePais(pais) : "Mundo") : uf === "EX" ? "Exterior" : uf ? NOME_UF[uf] : "Brasil"}
          </div>
          <h2 className="mt-2 font-serif text-3xl sm:text-4xl font-bold tracking-tight">
            {vista === "mundo" ? (pais ? `${nomePais(pais)}.` : "Pelo mundo.") : uf === "EX" ? "Fora do Brasil." : uf ? `${NOME_UF[uf]}.` : "Do Oiapoque ao Chuí."}
          </h2>
          <p className="mt-1 text-sm text-[var(--mapa-suave)]">
            {vista === "mundo"
              ? pais
                ? `${fmt(total)} ${rotuloPublico}${pais === SEM_PAIS ? " com telefone de fora do Brasil sem país identificado" : ""}.`
                : `${fmt(total)} ${rotuloPublico} em ${paises} ${paises === 1 ? "país" : "países"}${porPais.get(SEM_PAIS) ? ` (${fmt(porPais.get(SEM_PAIS)?.total ?? 0)} sem país identificado)` : ""}.`
              : uf === "EX"
              ? `${fmt(total)} ${rotuloPublico} com telefone de fora do Brasil.`
              : uf
                ? `${fmt(total)} ${rotuloPublico} em ${regioesDoUf.length} ${regioesDoUf.length === 1 ? "região" : "regiões"} de DDD.`
                : `${fmt(total)} ${rotuloPublico} em ${estados} ${estados === 1 ? "estado" : "estados"}${exterior ? ` e ${fmt(exterior)} fora do Brasil` : ""}.`}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6 sm:gap-10 text-right">
          {[
            [publico === "alunos" ? "Alunos" : "Clientes", fmt(total), "no filtro"],
            ["Ativos", fmt(ativos), "curso nos últimos 12 meses"],
            ["Ex-alunos", fmt(escopo.filter((a) => a.curso && !a.ativo).length), "acesso vencido"],
          ].map(([r, v, h]) => (
            <div key={r}>
              <div className="text-[11px] text-[var(--mapa-suave)]">{r}</div>
              <div className="text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight">{v}</div>
              <div className="text-[11px] text-[var(--mapa-destaque)] hidden sm:block">{h}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* mapa */}
        <div ref={quadro} className="mapa-quadro relative min-h-[420px] border-b lg:border-b-0 lg:border-r border-[var(--mapa-linha)]">
          <div className="absolute z-10 left-4 top-4 right-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Segmento<Vista> valor={vista} onChange={escolheVista} opcoes={[["brasil", "Brasil"], ["mundo", "Mundo"]]} />
              <Segmento<Publico> valor={publico} onChange={setPublico} opcoes={[["alunos", "Alunos"], ["todos", "Todos os clientes"]]} />
              <Segmento<Status> valor={status} onChange={setStatus} opcoes={[["todos", "Todos"], ["ativos", "Ativos"], ["ex", "Ex-alunos"]]} />
            </div>
            {vista === "mundo" && pais && (
              <button
                type="button"
                onClick={() => escolhePais(null)}
                className="rounded-full px-3 py-1 text-xs font-semibold bg-[var(--mapa-chip)] border border-[var(--mapa-linha)] hover:border-[var(--mapa-destaque)]"
              >
                ← Mundo
              </button>
            )}
            {vista === "brasil" && uf && (
              <button
                type="button"
                onClick={() => escolheUf(null)}
                className="rounded-full px-3 py-1 text-xs font-semibold bg-[var(--mapa-chip)] border border-[var(--mapa-linha)] hover:border-[var(--mapa-destaque)]"
              >
                ← Brasil
              </button>
            )}
          </div>

          {vista === "mundo" ? (
            <svg
              viewBox={caixaMundo.join(" ")}
              className="w-full h-[min(72vh,640px)] block"
              role="img"
              aria-label="Mapa do mundo com os alunos por país"
              onMouseLeave={() => setHoverPais(null)}
            >
              <defs>
                <filter id="brilho-mundo" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="1.6" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {PAISES.map((p) => {
                const v = porPais.get(p.iso)?.total ?? 0;
                // escala logarítmica: o Brasil tem muito mais gente que o resto
                const t = v ? Math.log(1 + v) / Math.log(1 + maxPais) : 0;
                const fora = pais && pais !== p.iso;
                const destaque = hoverPais?.iso === p.iso || pais === p.iso;
                return (
                  <path
                    key={p.iso}
                    d={p.path}
                    fill={v ? "var(--mapa-estado)" : "var(--mapa-vazio)"}
                    fillOpacity={v ? 0.22 + 0.78 * t : 1}
                    stroke={destaque ? "var(--mapa-destaque)" : "var(--mapa-borda)"}
                    strokeWidth={(destaque ? 1.4 : 0.4) / zoomMundo}
                    opacity={fora ? 0.35 : 1}
                    className={v ? "cursor-pointer transition-[opacity] duration-300" : "transition-[opacity] duration-300"}
                    onMouseMove={(ev) => {
                      if (!v) return setHoverPais(null);
                      const r = quadro.current?.getBoundingClientRect();
                      if (r) setHoverPais({ iso: p.iso, x: ev.clientX - r.left, y: ev.clientY - r.top, largura: r.width });
                    }}
                    onClick={() => v && escolhePais(pais === p.iso ? null : p.iso)}
                  >
                    <title>{`${p.nome}: ${fmt(v)} ${rotuloPublico}`}</title>
                  </path>
                );
              })}
              {/* bolinhas: deixam visível país pequeno (Portugal, Suíça…) */}
              {[...porPais.entries()]
                .filter(([k]) => PAIS[k])
                .sort((a, b) => b[1].total - a[1].total)
                .map(([k, v]) => {
                  const [x, y] = PAIS[k].centro;
                  const r = (2 + 7 * Math.sqrt(v.total / maxPais)) / Math.sqrt(zoomMundo);
                  return (
                    <g key={k} className="cursor-pointer" onClick={() => escolhePais(pais === k ? null : k)}>
                      <circle cx={x} cy={y} r={r} fill="var(--mapa-ponto)" fillOpacity={pais === k ? 0.95 : 0.8} filter="url(#brilho-mundo)" />
                      <circle cx={x} cy={y} r={r} fill="none" stroke="var(--mapa-ponto-borda)" strokeWidth={0.6 / zoomMundo} />
                      <title>{`${PAIS[k].nome}: ${fmt(v.total)}`}</title>
                    </g>
                  );
                })}
            </svg>
          ) : (
          <svg
            viewBox={caixa.join(" ")}
            className="w-full h-[min(72vh,640px)] block"
            role="img"
            aria-label="Mapa do Brasil com os alunos por estado"
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <filter id="brilho" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {ESTADOS.map((e) => {
              const v = porUf.get(e.uf)?.total ?? 0;
              const t = v ? Math.sqrt(v / maxUf) : 0;
              const fora = uf && uf !== e.uf;
              return (
                <path
                  key={e.uf}
                  d={e.path}
                  fill={v ? "var(--mapa-estado)" : "var(--mapa-vazio)"}
                  fillOpacity={v ? 0.16 + 0.84 * t : 1}
                  stroke={hover?.uf === e.uf || uf === e.uf ? "var(--mapa-destaque)" : "var(--mapa-borda)"}
                  strokeWidth={(hover?.uf === e.uf || uf === e.uf ? 1.6 : 0.6) / zoom}
                  opacity={fora ? 0.28 : 1}
                  className="cursor-pointer transition-[opacity] duration-300"
                  onMouseMove={(ev) => {
                    const r = quadro.current?.getBoundingClientRect();
                    if (r) setHover({ uf: e.uf, x: ev.clientX - r.left, y: ev.clientY - r.top, largura: r.width });
                  }}
                  onClick={() => escolheUf(uf === e.uf ? null : e.uf)}
                >
                  <title>{`${e.nome}: ${fmt(v)} ${rotuloPublico}`}</title>
                </path>
              );
            })}
            {/* regiões de DDD */}
            {[...porDdd.entries()]
              .filter(([d]) => !uf || DDD[d]?.uf === uf)
              .sort((a, b) => b[1] - a[1])
              .map(([d, n]) => {
                const [x, y] = PONTO[d];
                const r = ((uf ? 5 : 2.2) + (uf ? 16 : 9) * Math.sqrt(n / maxDdd)) / (uf ? zoom : 1);
                const ativoD = ddd === d;
                return (
                  <g key={d} className="cursor-pointer" onClick={() => { setUf(DDD[d].uf); setDdd(ddd === d ? null : d); setLimite(120); }}>
                    <circle cx={x} cy={y} r={r} fill="var(--mapa-ponto)" fillOpacity={ativoD ? 0.95 : 0.78} filter="url(#brilho)" />
                    <circle cx={x} cy={y} r={r} fill="none" stroke="var(--mapa-ponto-borda)" strokeWidth={(ativoD ? 2 : 0.8) / zoom} />
                    {uf && (
                      <text
                        x={x + r + 4 / zoom}
                        y={y + 4 / zoom}
                        fontSize={12 / zoom}
                        fontWeight={700}
                        fill="var(--mapa-texto)"
                        stroke="var(--mapa-fundo)"
                        strokeWidth={3 / zoom}
                        paintOrder="stroke"
                      >
                        {`${DDD[d].regiao} · ${fmt(n)}`}
                      </text>
                    )}
                    <title>{`DDD ${d} · ${DDD[d].regiao}: ${fmt(n)}`}</title>
                  </g>
                );
              })}
          </svg>
          )}

          {vista === "mundo" && hoverPais && !pais && (
            <div
              className="pointer-events-none absolute z-20 rounded-lg px-3 py-2 text-xs shadow-lg border border-[var(--mapa-linha)] bg-[var(--mapa-tooltip)]"
              style={{ left: Math.min(hoverPais.x + 14, hoverPais.largura - 190), top: hoverPais.y + 14 }}
            >
              <div className="font-semibold text-[var(--mapa-texto)]">{nomePais(hoverPais.iso)}</div>
              <div className="text-[var(--mapa-suave)] tabular-nums">
                {fmt(porPais.get(hoverPais.iso)?.total ?? 0)} {rotuloPublico} · {fmt(porPais.get(hoverPais.iso)?.ativos ?? 0)} ativos
              </div>
              <div className="text-[var(--mapa-destaque)] mt-0.5">{hoverPais.iso === "BR" ? "Clique pra ver os estados" : "Clique pra ver os nomes"}</div>
            </div>
          )}

          {vista === "brasil" && hover && !uf && (
            <div
              className="pointer-events-none absolute z-20 rounded-lg px-3 py-2 text-xs shadow-lg border border-[var(--mapa-linha)] bg-[var(--mapa-tooltip)]"
              style={{ left: Math.min(hover.x + 14, hover.largura - 190), top: hover.y + 14 }}
            >
              <div className="font-semibold text-[var(--mapa-texto)]">{NOME_UF[hover.uf]}</div>
              <div className="text-[var(--mapa-suave)] tabular-nums">
                {fmt(porUf.get(hover.uf)?.total ?? 0)} {rotuloPublico} · {fmt(porUf.get(hover.uf)?.ativos ?? 0)} ativos
              </div>
              <div className="text-[var(--mapa-destaque)] mt-0.5">Clique pra ver o estado</div>
            </div>
          )}

          <div className="absolute left-4 bottom-3 right-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--mapa-suave)]">
            <div className="flex items-center gap-2">
              <span>Menos</span>
              {[0.16, 0.37, 0.58, 0.79, 1].map((o) => (
                <span key={o} className="inline-block h-2.5 w-5 rounded-sm" style={{ background: "var(--mapa-estado)", opacity: o }} />
              ))}
              <span>Mais</span>
              <span className="ml-3 inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--mapa-ponto)" }} /> {vista === "mundo" ? "país" : "região do DDD"}
              </span>
            </div>
            <div className="flex gap-2">
              {vista === "brasil" && exterior > 0 && (
                <button type="button" onClick={() => escolheVista("mundo")} className="rounded-full px-2.5 py-0.5 border border-[var(--mapa-linha)] hover:border-[var(--mapa-destaque)]">
                  Exterior · {fmt(exterior)} →
                </button>
              )}
              {vista === "brasil" && semLugar > 0 && <span className="px-1">Sem DDD válido · {fmt(semLugar)}</span>}
            </div>
          </div>
        </div>

        {/* painel lateral */}
        <div className="flex flex-col min-h-0 max-h-[min(80vh,760px)]">
          {vista === "mundo" && !pais ? (
            <div className="p-5 overflow-y-auto">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--mapa-suave)] mb-3">Países</div>
              <ul className="grid gap-1.5">
                {rankingPaises.map(([k, v]) => (
                  <li key={k}>
                    <button type="button" onClick={() => escolhePais(k)} onMouseEnter={() => setHoverPais(null)} className="group w-full text-left grid grid-cols-[2.2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--mapa-chip)]">
                      <span className="text-xs font-mono text-[var(--mapa-suave)]">{k === SEM_PAIS ? "—" : k}</span>
                      <span className="min-w-0">
                        <span className="block text-sm truncate">{nomePais(k)}</span>
                        <span className="block h-1 mt-1 rounded-full bg-[var(--mapa-vazio)] overflow-hidden">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (Math.log(1 + v.total) / Math.log(1 + maxPais)) * 100)}%`, background: "var(--mapa-estado)" }} />
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{fmt(v.total)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : vista === "brasil" && !uf ? (
            <div className="p-5 overflow-y-auto">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--mapa-suave)] mb-3">Estados</div>
              <ul className="grid gap-1.5">
                {ranking.map(([u, v]) => (
                  <li key={u}>
                    <button type="button" onClick={() => escolheUf(u)} onMouseEnter={() => setHover(null)} className="group w-full text-left grid grid-cols-[2.2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--mapa-chip)]">
                      <span className="text-xs font-mono text-[var(--mapa-suave)]">{u}</span>
                      <span className="min-w-0">
                        <span className="block text-sm truncate">{NOME_UF[u]}</span>
                        <span className="block h-1 mt-1 rounded-full bg-[var(--mapa-vazio)] overflow-hidden">
                          <span className="block h-full rounded-full" style={{ width: `${(v.total / maxUf) * 100}%`, background: "var(--mapa-estado)" }} />
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{fmt(v.total)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="p-5 pb-3 border-b border-[var(--mapa-linha)]">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-lg font-semibold">{vista === "mundo" ? nomePais(pais ?? SEM_PAIS) : uf === "EX" ? "Exterior" : uf ? NOME_UF[uf] : ""}</div>
                  <div className="text-sm tabular-nums text-[var(--mapa-suave)]">{fmt(lista.length)} {lista.length === 1 ? "pessoa" : "pessoas"}</div>
                </div>
                {vista === "brasil" && regioesDoUf.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {regioesDoUf.map(({ d, r, n }) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDdd(ddd === d ? null : d)}
                        aria-pressed={ddd === d}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors ${
                          ddd === d ? "bg-[var(--mapa-ponto)] border-[var(--mapa-ponto)] text-white" : "border-[var(--mapa-linha)] hover:border-[var(--mapa-destaque)]"
                        }`}
                        title={`DDD ${d}`}
                      >
                        {r.regiao} · {fmt(n)}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar nome ou cidade…"
                  className="mt-3 w-full rounded-lg px-3 py-2 text-sm bg-[var(--mapa-chip)] border border-[var(--mapa-linha)] placeholder:text-[var(--mapa-suave)] focus:outline-none focus:border-[var(--mapa-destaque)]"
                />
              </div>
              <ul className="overflow-y-auto px-3 py-2 divide-y divide-[var(--mapa-linha)]">
                {lista.slice(0, limite).map((a) => (
                  <li key={a.id} className="px-2 py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{a.nome}</div>
                      <div className="text-[11px] text-[var(--mapa-suave)] truncate">
                        {[a.cidade, a.ddd ? DDD[a.ddd]?.regiao : null, vista === "mundo" || a.exterior ? (a.pais ? nomePais(a.pais) : null) : null].filter(Boolean).join(" · ") || "—"}
                        {a.produtos ? ` · ${a.produtos}` : ""}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        a.ativo ? "bg-[var(--mapa-ponto)] text-white" : "border border-[var(--mapa-linha)] text-[var(--mapa-suave)]"
                      }`}
                    >
                      {a.ativo ? "Ativo" : a.curso ? "Ex-aluno" : "Cliente"}
                    </span>
                  </li>
                ))}
                {lista.length > limite && (
                  <li className="py-3 text-center">
                    <button type="button" onClick={() => setLimite((l) => l + 200)} className="text-xs font-semibold text-[var(--mapa-destaque)] hover:underline">
                      Mostrar mais ({fmt(lista.length - limite)})
                    </button>
                  </li>
                )}
                {lista.length === 0 && <li className="py-6 text-center text-sm text-[var(--mapa-suave)]">Ninguém com esse filtro.</li>}
              </ul>
            </>
          )}
        </div>
      </div>
      <div className="px-5 py-2 text-[10px] text-[var(--mapa-suave)] border-t border-[var(--mapa-linha)] flex flex-wrap justify-between gap-2">
        <span>Região pelo DDD do telefone da compra (ou cidade do endereço na TMB); fora do Brasil, pelo código do país. Ativo = comprou curso nos últimos 12 meses.</span>
        <span>Mapas: svg-maps/brazil, de Victor Cazanave (CC BY 4.0); mundo, Natural Earth (domínio público)</span>
      </div>
    </div>
  );
}
