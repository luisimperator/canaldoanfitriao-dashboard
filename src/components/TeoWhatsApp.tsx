"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lightbox } from "@/components/Lightbox";

// WhatsApp do Téo: tudo o que o Téo está conversando, no visual do WhatsApp.
// Só leitura (pra acompanhar). A lista atualiza a cada 10 s e a conversa
// aberta a cada 6 s; com a aba do navegador escondida, para de buscar.

interface Conversa {
  contact_id: string;
  nome: string | null;
  telefone: string | null;
  estado: string | null;
  motivo_humano: string | null;
  black_vendedor: string | null;
  venda_teo: boolean | null;
  respostas: number | null;
  erro: string | null;
  ultima_em: string | null;
  ultimo_texto: string | null;
  ultimo_de: "lead" | "teo" | null;
  disparo: string | null;
}

interface Msg {
  d: string;
  s: "c" | "t" | "h" | "a" | "p" | "n";
  tx: string | null;
  ty: string;
  u?: string | null;
  tr?: string | null;
}

interface Detalhe {
  conversa: {
    contact_id: string;
    nome: string | null;
    telefone: string | null;
    estado: string | null;
    respostas: number | null;
    ficha: string | null;
    motivo_humano: string | null;
    black_vendedor: string | null;
    erro: string | null;
    venda_teo: boolean | null;
  };
  calls: { inicio: string; vendedor: string | null; status: string }[];
  msgs: Msg[];
  erro?: string;
}

type Filtro = "todas" | "teo" | "vendedor" | "disparo";

const LISTA_MS = 10_000;
const CONVERSA_MS = 6_000;
const TZ = "America/Sao_Paulo";

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

function diaChave(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ });
}

function quando(iso: string | null): string {
  if (!iso) return "";
  return diaChave(iso) === diaChave(new Date().toISOString())
    ? hora(iso)
    : new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
}

function rotuloDia(iso: string): string {
  const hoje = diaChave(new Date().toISOString());
  const ontem = diaChave(new Date(Date.now() - 86_400_000).toISOString());
  const d = diaChave(iso);
  if (d === hoje) return "Hoje";
  if (d === ontem) return "Ontem";
  return new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: TZ });
}

function telefoneBonito(t: string | null): string {
  if (!t) return "";
  const d = t.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const n = d.slice(4);
    return `(${ddd}) ${n.slice(0, n.length - 4)}-${n.slice(-4)}`;
  }
  return t;
}

function iniciais(nome: string | null): string {
  const p = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0][0] ?? "") + (p.length > 1 ? p[p.length - 1][0] ?? "" : "")).toUpperCase();
}

// Cor do avatar fixa por contato.
const CORES = ["bg-emerald-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-teal-600", "bg-indigo-600"];
function corAvatar(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

function comVendedor(c: { estado: string | null }): boolean {
  return c.estado === "humano";
}

function situacao(c: { estado: string | null; motivo_humano: string | null; black_vendedor: string | null }): string {
  if (c.estado === "humano") {
    if (c.motivo_humano === "sem_interesse") return "encerrada: sem interesse";
    return c.black_vendedor ? `com ${c.black_vendedor.split(" ")[0]}` : "com o time";
  }
  if (c.estado === "em_conversa") return "Téo conversando";
  if (c.estado === "novo") return "Téo vai abrir";
  return c.estado ?? "";
}

const AUTOR: Record<Msg["s"], string> = {
  c: "",
  t: "Téo",
  h: "Time",
  a: "Automação",
  p: "",
  n: "Nota interna",
};

function Bolha({ m, onImagem }: { m: Msg; onImagem: (u: string) => void }) {
  if (m.s === "p") {
    return (
      <div className="my-1 flex justify-center">
        <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-slate-500 shadow-sm dark:bg-[#182229] dark:text-zinc-400">
          {m.tx ?? m.ty} · {hora(m.d)}
        </span>
      </div>
    );
  }
  if (m.s === "n") {
    return (
      <div className="my-1 flex justify-center">
        <div className="max-w-[85%] rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">📝 Nota interna · {hora(m.d)}</div>
          <div className="whitespace-pre-wrap">{m.tx}</div>
        </div>
      </div>
    );
  }
  const saindo = m.s !== "c";
  const fundo =
    m.s === "c"
      ? "bg-white text-slate-900 dark:bg-[#202c33] dark:text-zinc-100"
      : m.s === "t"
        ? "bg-[#d9fdd3] text-slate-900 dark:bg-[#005c4b] dark:text-zinc-50"
        : m.s === "h"
          ? "bg-sky-100 text-slate-900 dark:bg-sky-900/70 dark:text-zinc-50"
          : "bg-amber-100 text-slate-900 dark:bg-amber-900/50 dark:text-zinc-50";
  const audio = m.ty === "audio" || m.ty === "ptt";
  const imagem = m.ty === "image" || m.ty === "sticker";
  return (
    <div className={`flex ${saindo ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-[14px] leading-snug shadow-sm sm:max-w-[70%] ${fundo}`}>
        {AUTOR[m.s] && (
          <div
            className={`mb-0.5 text-[11px] font-semibold ${
              m.s === "t" ? "text-emerald-700 dark:text-emerald-300" : m.s === "h" ? "text-sky-700 dark:text-sky-300" : "text-amber-700 dark:text-amber-300"
            }`}
          >
            {AUTOR[m.s]}
            {m.ty === "template" && " · template"}
          </div>
        )}
        {imagem && m.u && (
          <button onClick={() => onImagem(m.u!)} className="mb-1 block cursor-zoom-in" title="Ver em tela cheia">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.u} alt="imagem" className="max-h-64 rounded-md" />
          </button>
        )}
        {audio && m.u && <audio controls preload="none" src={m.u} className="mb-1 h-9 w-60 max-w-full" />}
        {audio && m.tr && <div className="mb-1 whitespace-pre-wrap text-[13px] italic opacity-80">🎤 “{m.tr}”</div>}
        {audio && !m.tr && !m.u && <div className="italic opacity-70">🎤 áudio</div>}
        {!audio && !imagem && m.u && (
          <a href={m.u} target="_blank" rel="noreferrer" className="mb-1 block underline">
            📎 {m.ty === "video" ? "vídeo" : "arquivo"}
          </a>
        )}
        {m.tx && <div className="whitespace-pre-wrap break-words">{m.tx}</div>}
        {!m.tx && !m.u && !audio && <div className="italic opacity-60">({m.ty})</div>}
        <div className="mt-0.5 text-right text-[10px] opacity-60">{hora(m.d)}</div>
      </div>
    </div>
  );
}

export function TeoWhatsApp() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carregou, setCarregou] = useState(false);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<number | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const rolagemRef = useRef<HTMLDivElement>(null);
  const grudadoNoFim = useRef(true);
  const ultimaQtd = useRef(0);

  const carregarLista = useCallback(async () => {
    if (document.hidden) return;
    const res = await fetch("/api/teo/whatsapp", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const j = await res.json();
    setConversas(j.conversas ?? []);
    setCarregou(true);
    setAtualizadoEm(Date.now());
  }, []);

  const carregarConversa = useCallback(async (id: string) => {
    if (document.hidden) return;
    const res = await fetch(`/api/teo/whatsapp?contact=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const j = (await res.json()) as Detalhe;
    setDetalhe((antes) => (antes && antes.conversa.contact_id !== id ? antes : j));
    setAtualizadoEm(Date.now());
  }, []);

  useEffect(() => {
    const primeira = setTimeout(carregarLista, 0);
    const t = setInterval(carregarLista, LISTA_MS);
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    const voltou = () => {
      if (!document.hidden) carregarLista();
    };
    document.addEventListener("visibilitychange", voltou);
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", voltou);
    };
  }, [carregarLista]);

  useEffect(() => {
    if (!ativa) return;
    const puxar = () => carregarConversa(ativa);
    const primeira = setTimeout(puxar, 0);
    const t = setInterval(puxar, CONVERSA_MS);
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
    };
  }, [ativa, carregarConversa]);

  // Desce pro fim quando chega mensagem nova, se a pessoa já estava no fim.
  const qtdMsgs = detalhe?.msgs.length ?? 0;
  useEffect(() => {
    const el = rolagemRef.current;
    if (!el) return;
    if (qtdMsgs !== ultimaQtd.current && grudadoNoFim.current) el.scrollTop = el.scrollHeight;
    ultimaQtd.current = qtdMsgs;
  }, [qtdMsgs]);

  function abrir(id: string) {
    if (id === ativa) return;
    grudadoNoFim.current = true;
    ultimaQtd.current = -1;
    setDetalhe(null);
    setAtiva(id);
  }

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return conversas.filter((c) => {
      if (filtro === "teo" && comVendedor(c)) return false;
      if (filtro === "vendedor" && !comVendedor(c)) return false;
      if (filtro === "disparo" && !c.disparo) return false;
      if (!q) return true;
      return (
        (c.nome ?? "").toLowerCase().includes(q) ||
        (c.telefone ?? "").includes(q.replace(/\D/g, "") || "§") ||
        (c.ultimo_texto ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversas, busca, filtro]);

  const contagem = useMemo(
    () => ({
      todas: conversas.length,
      teo: conversas.filter((c) => !comVendedor(c)).length,
      vendedor: conversas.filter(comVendedor).length,
      disparo: conversas.filter((c) => c.disparo).length,
    }),
    [conversas]
  );

  const ativaResumo = conversas.find((c) => c.contact_id === ativa) ?? null;
  const conv = detalhe?.conversa ?? null;
  const segundos = atualizadoEm ? Math.max(0, Math.round((agora - atualizadoEm) / 1000)) : null;

  // Mensagens com separador de dia.
  const blocos = useMemo(() => {
    const out: ({ tipo: "dia"; rotulo: string; key: string } | { tipo: "msg"; m: Msg; key: string })[] = [];
    let dia = "";
    (detalhe?.msgs ?? []).forEach((m, i) => {
      const k = diaChave(m.d);
      if (k !== dia) {
        dia = k;
        out.push({ tipo: "dia", rotulo: rotuloDia(m.d), key: `d-${k}` });
      }
      out.push({ tipo: "msg", m, key: `m-${i}-${m.d}` });
    });
    return out;
  }, [detalhe]);

  const chip = (f: Filtro, label: string) => (
    <button
      onClick={() => setFiltro(f)}
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        filtro === f
          ? "bg-emerald-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.07] dark:text-zinc-400 dark:hover:bg-white/15"
      }`}
    >
      {label} {contagem[f]}
    </button>
  );

  return (
    <div className="grid gap-3 lg:h-[calc(100vh-200px)] lg:grid-cols-[360px_1fr]">
      {ampliada && <Lightbox src={ampliada} onFechar={() => setAmpliada(null)} />}

      {/* Lista */}
      <div
        className={`${ativa ? "hidden lg:flex" : "flex"} h-[calc(100vh-180px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-surface lg:h-full`}
      >
        <div className="space-y-2 border-b border-slate-200 p-3 dark:border-white/10">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome, telefone ou mensagem"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
          />
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {chip("todas", "Todas")}
            {chip("teo", "Com o Téo")}
            {chip("vendedor", "Com o time")}
            {chip("disparo", "Disparo")}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!carregou && <p className="px-3 py-6 text-sm text-slate-500 dark:text-zinc-400">Carregando…</p>}
          {carregou && visiveis.length === 0 && (
            <p className="px-3 py-6 text-sm text-slate-500 dark:text-zinc-400">Nenhuma conversa aqui.</p>
          )}
          {visiveis.map((c) => (
            <button
              key={c.contact_id}
              onClick={() => abrir(c.contact_id)}
              className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50 dark:border-white/[0.06] dark:hover:bg-white/[0.03] ${
                ativa === c.contact_id ? "bg-slate-100 dark:bg-white/[0.06]" : ""
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${corAvatar(c.contact_id)}`}
              >
                {iniciais(c.nome)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    {c.nome || telefoneBonito(c.telefone)}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] ${
                      c.ultimo_de === "lead" ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-zinc-500"
                    }`}
                  >
                    {quando(c.ultima_em)}
                  </span>
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-zinc-400">
                  {c.ultimo_de === "teo" && <span className="text-emerald-700 dark:text-emerald-400">Téo: </span>}
                  {c.ultimo_texto && c.ultimo_texto !== "respondeu" ? c.ultimo_texto : c.ultimo_de === "teo" ? "…" : ""}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span
                    className={`rounded px-1 text-[10px] font-semibold ${
                      comVendedor(c)
                        ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    }`}
                  >
                    {situacao(c)}
                  </span>
                  {c.disparo && (
                    <span className="rounded bg-violet-100 px-1 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                      {c.disparo}
                    </span>
                  )}
                  {c.venda_teo && (
                    <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      venda direta
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversa */}
      <div
        className={`${ativa ? "flex" : "hidden lg:flex"} h-[calc(100vh-180px)] flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 lg:h-full`}
      >
        {!ativa ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#f0f2f5] p-6 text-center text-sm text-slate-500 dark:bg-[#0b141a] dark:text-zinc-400">
            <div className="text-4xl">🟢</div>
            <p>Escolha uma conversa à esquerda.</p>
            <p className="text-xs opacity-70">
              {segundos !== null ? `Atualizado há ${segundos}s` : "Conectando…"} · só leitura
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 bg-[#f0f2f5] px-3 py-2 dark:border-white/10 dark:bg-[#202c33]">
              <button
                onClick={() => setAtiva(null)}
                className="rounded-md px-1.5 py-1 text-lg text-slate-600 hover:bg-black/5 dark:text-zinc-300 lg:hidden"
                aria-label="Voltar pra lista"
              >
                ←
              </button>
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${corAvatar(ativa)}`}
              >
                {iniciais(conv?.nome ?? ativaResumo?.nome ?? null)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {conv?.nome || ativaResumo?.nome || telefoneBonito(conv?.telefone ?? ativaResumo?.telefone ?? null)}
                </div>
                <div className="truncate text-[11px] text-slate-500 dark:text-zinc-400">
                  {telefoneBonito(conv?.telefone ?? ativaResumo?.telefone ?? null)}
                  {conv && ` · ${situacao(conv)}`}
                  {ativaResumo?.disparo && ` · ${ativaResumo.disparo}`}
                  {detalhe?.calls?.length
                    ? ` · call ${new Date(detalhe.calls[detalhe.calls.length - 1].inicio).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: TZ,
                      })} (${detalhe.calls[detalhe.calls.length - 1].status})`
                    : ""}
                </div>
              </div>
              <div className="hidden shrink-0 text-[10px] text-slate-400 dark:text-zinc-500 sm:block">
                {segundos !== null ? `há ${segundos}s` : ""}
              </div>
            </div>

            {conv?.ficha && (
              <details className="border-b border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 dark:border-white/10 dark:bg-[#111b21] dark:text-zinc-300">
                <summary className="cursor-pointer font-semibold">Ficha do Téo</summary>
                <div className="mt-1 whitespace-pre-wrap">{conv.ficha}</div>
              </details>
            )}

            <div
              ref={rolagemRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                grudadoNoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-[#efeae2] px-3 py-3 dark:bg-[#0b141a] sm:px-6"
            >
              {!detalhe && <p className="py-6 text-center text-sm text-slate-500 dark:text-zinc-400">Carregando conversa…</p>}
              {detalhe?.erro && (
                <p className="py-2 text-center text-xs text-rose-600 dark:text-rose-400">
                  Não consegui ler o Unnichat agora ({detalhe.erro}). Tento de novo em instantes.
                </p>
              )}
              {blocos.map((b) =>
                b.tipo === "dia" ? (
                  <div key={b.key} className="sticky top-0 z-10 my-2 flex justify-center">
                    <span className="rounded-md bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm dark:bg-[#182229] dark:text-zinc-400">
                      {b.rotulo}
                    </span>
                  </div>
                ) : (
                  <Bolha key={b.key} m={b.m} onImagem={setAmpliada} />
                )
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-[#f0f2f5] px-3 py-2 text-[11px] text-slate-500 dark:border-white/10 dark:bg-[#202c33] dark:text-zinc-400">
              <span>Só leitura: quem responde é o Téo (ou o vendedor, no Unnichat).</span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> ao vivo
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
