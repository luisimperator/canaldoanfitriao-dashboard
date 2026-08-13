"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CorrigirIA } from "@/components/CorrigirIA";
import { TemplatePicker } from "@/components/TemplatePicker";

// Caixa de entrada do suporte: lista de conversas + thread + resposta.
//
// Depois que o número vai pro WhatsApp oficial (Cloud API), ele não vive mais
// num aplicativo — esta tela É o WhatsApp do suporte. Por isso ela precisa dar
// conta do básico: ver anexo, responder, e saber se a janela de 24h fechou.
//
// Atualiza sozinha a cada 10s (polling simples; sem websocket por enquanto).

interface Conversa {
  wa_phone: string;
  nome: string | null;
  ultimo_texto: string | null;
  ultimo_em: string | null;
  ultima_entrada_em: string | null;
  nao_lidas: number;
  ia_ativa: boolean;
  status: string;
  atendente: string | null;
}

interface Mensagem {
  id: string;
  direction: "in" | "out";
  text: string | null;
  tipo: string;
  media_path: string | null;
  media_mime: string | null;
  media_url?: string | null;
  autor: string;
  wa_status: string | null;
  escalated: boolean;
  created_at: string;
}

const POLL_MS = 10_000;

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? hora(iso)
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

function telefoneBonito(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d}`;
}

/** Horas restantes da janela de 24h (null = já fechou). */
function janelaRestante(ultimaEntrada: string | null): number | null {
  if (!ultimaEntrada) return null;
  const passou = Date.now() - Date.parse(ultimaEntrada);
  const resta = 24 * 3600_000 - passou;
  return resta > 0 ? Math.floor(resta / 3600_000) : null;
}

export function SupportInbox() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [conversa, setConversa] = useState<Conversa | null>(null);
  const [texto, setTexto] = useState("");
  // id da mensagem da IA que está sendo corrigida (modo chefe)
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const carregarLista = useCallback(async () => {
    const res = await fetch("/api/support/inbox");
    if (!res.ok) return;
    const j = await res.json();
    setConversas(j.conversas ?? []);
  }, []);

  const carregarThread = useCallback(async (phone: string) => {
    const res = await fetch(`/api/support/inbox?phone=${encodeURIComponent(phone)}`);
    if (!res.ok) return;
    const j = await res.json();
    setMensagens(j.mensagens ?? []);
    setConversa(j.conversa ?? null);
  }, []);

  // Carga inicial fora do corpo do efeito (setTimeout 0): a regra do React
  // nesta versão proíbe setState síncrono dentro do efeito — o efeito só
  // assina a fonte externa e deixa os callbacks atualizarem o estado.
  useEffect(() => {
    const primeira = setTimeout(carregarLista, 0);
    const t = setInterval(carregarLista, POLL_MS);
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
    };
  }, [carregarLista]);

  useEffect(() => {
    if (!ativa) return;
    const puxar = () => carregarThread(ativa);
    const primeira = setTimeout(puxar, 0);
    const t = setInterval(puxar, POLL_MS);
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
    };
  }, [ativa, carregarThread]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  async function enviar() {
    if (!ativa || !texto.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/support/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: ativa, text: texto }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(j.error ?? `Erro ${res.status}`);
        return;
      }
      setTexto("");
      await carregarThread(ativa);
      await carregarLista();
    } catch {
      setErro("Falha de rede");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarIA() {
    if (!ativa || !conversa) return;
    await fetch("/api/support/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: ativa, iaAtiva: !conversa.ia_ativa }),
    });
    carregarThread(ativa);
    carregarLista();
  }

  async function resolver() {
    if (!ativa || !conversa) return;
    await fetch("/api/support/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: ativa,
        status: conversa.status === "resolvida" ? "aberta" : "resolvida",
      }),
    });
    carregarThread(ativa);
    carregarLista();
  }

  const restante = janelaRestante(conversa?.ultima_entrada_em ?? null);
  const janelaFechada = conversa != null && restante === null;

  return (
    // Cada painel tem a própria altura e o próprio scroll: sem isso a página
    // inteira crescia com a conversa e virava rolagem infinita no celular.
    <div className="grid gap-3 lg:h-[calc(100vh-230px)] lg:grid-cols-[320px_1fr]">
      {/* Lista de conversas */}
      <div className="flex max-h-[38vh] flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] lg:max-h-none lg:h-full">
        <div className="border-b border-slate-200 dark:border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
          Conversas ({conversas.length})
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversas.length === 0 && (
            <p className="px-3 py-6 text-sm text-slate-500 dark:text-zinc-400">
              Nenhuma conversa ainda. Quando o número oficial receber a primeira mensagem, ela
              aparece aqui.
            </p>
          )}
          {conversas.map((c) => (
            <button
              key={c.wa_phone}
              onClick={() => setAtiva(c.wa_phone)}
              className={`flex w-full items-start gap-2 border-b border-slate-100 dark:border-white/[0.06] px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] ${
                ativa === c.wa_phone ? "bg-slate-50 dark:bg-white/[0.05]" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    {c.nome || telefoneBonito(c.wa_phone)}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-400 dark:text-zinc-500">
                    {quando(c.ultimo_em)}
                  </span>
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-zinc-400">
                  {c.ultimo_texto ?? ""}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  {c.nao_lidas > 0 && (
                    <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">
                      {c.nao_lidas}
                    </span>
                  )}
                  {!c.ia_ativa && (
                    <span className="rounded bg-violet-100 dark:bg-violet-500/15 px-1 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                      humano
                    </span>
                  )}
                  {c.status === "resolvida" && (
                    <span className="rounded bg-slate-100 dark:bg-white/10 px-1 text-[10px] text-slate-500 dark:text-zinc-400">
                      resolvida
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className="flex h-[65vh] flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] lg:h-full">
        {!ativa || !conversa ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-500 dark:text-zinc-400">
            Escolha uma conversa à esquerda.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/10 px-4 py-2.5">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {conversa.nome || telefoneBonito(conversa.wa_phone)}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                  {telefoneBonito(conversa.wa_phone)}
                  {conversa.atendente && ` · ${conversa.atendente}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={alternarIA}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    conversa.ia_ativa
                      ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-300"
                  }`}
                >
                  IA {conversa.ia_ativa ? "ligada" : "desligada"}
                </button>
                <button
                  onClick={resolver}
                  className="rounded-lg border border-slate-300 dark:border-white/15 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-zinc-300"
                >
                  {conversa.status === "resolvida" ? "Reabrir" : "Resolver"}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {mensagens.map((m, i) => {
                const meu = m.direction === "out";
                // pergunta que originou a resposta da IA (pro modo chefe)
                const perguntaAnterior =
                  m.autor === "ia"
                    ? [...mensagens.slice(0, i)].reverse().find((x) => x.direction === "in")
                        ?.text ?? ""
                    : "";
                return (
                  <div key={m.id} className={`flex flex-col ${meu ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        meu
                          ? m.autor === "ia"
                            ? "bg-violet-100 dark:bg-violet-500/15 text-slate-800 dark:text-zinc-100"
                            : "bg-emerald-100 dark:bg-emerald-500/15 text-slate-800 dark:text-zinc-100"
                          : "bg-slate-100 dark:bg-white/[0.06] text-slate-800 dark:text-zinc-100"
                      }`}
                    >
                      {m.media_url && m.media_mime?.startsWith("image/") && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.media_url}
                          alt="anexo"
                          className="mb-1 max-h-64 rounded-lg"
                        />
                      )}
                      {m.media_url && m.media_mime?.startsWith("audio/") && (
                        <audio controls src={m.media_url} className="mb-1 w-56" />
                      )}
                      {m.media_url && !m.media_mime?.startsWith("image/") && !m.media_mime?.startsWith("audio/") && (
                        <a
                          href={m.media_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mb-1 block underline"
                        >
                          📎 abrir anexo
                        </a>
                      )}
                      {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
                      <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] opacity-60">
                        {m.autor === "ia" && <span>IA</span>}
                        {m.escalated && <span title="escalado para humano">⚑</span>}
                        <span>{hora(m.created_at)}</span>
                        {meu && m.wa_status && <span>· {m.wa_status}</span>}
                      </div>
                    </div>

                    {/* Modo chefe: só faz sentido em cima do que a IA falou */}
                    {m.autor === "ia" && corrigindo !== m.id && (
                      <button
                        onClick={() => setCorrigindo(m.id)}
                        className="mt-0.5 text-[10px] text-slate-400 hover:text-amber-600 dark:text-zinc-600 dark:hover:text-amber-400"
                      >
                        ✎ corrigir a IA
                      </button>
                    )}
                    {corrigindo === m.id && (
                      <div className="w-full max-w-[85%]">
                        <CorrigirIA
                          mensagemCliente={perguntaAnterior}
                          respostaIA={m.text ?? ""}
                          onFechar={() => setCorrigindo(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={fimRef} />
            </div>

            <div className="border-t border-slate-200 dark:border-white/10 p-3">
              {janelaFechada ? (
                <TemplatePicker
                  phone={ativa}
                  onEnviado={() => {
                    carregarThread(ativa);
                    carregarLista();
                  }}
                />
              ) : (
                <>
                  <div className="flex items-end gap-2">
                    <textarea
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          enviar();
                        }
                      }}
                      rows={2}
                      placeholder="Escreva a resposta… (Enter envia, Shift+Enter quebra linha)"
                      className="flex-1 resize-none rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100"
                    />
                    <button
                      onClick={enviar}
                      disabled={enviando || !texto.trim()}
                      className="rounded-lg bg-slate-900 dark:bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {enviando ? "..." : "Enviar"}
                    </button>
                  </div>
                  {restante !== null && restante <= 4 && (
                    <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                      A janela de 24h fecha em ~{restante}h.
                    </p>
                  )}
                </>
              )}
              {erro && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{erro}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
