"use client";

import { useRef, useState } from "react";
import { KB_BLOCOS } from "@/lib/support";

type Kind = "cliente" | "ia" | "chefe";
interface Msg {
  kind: Kind;
  content: string;
  escalated?: boolean;
  tools?: string[];
  corrigida?: boolean;
}

interface RuleCard {
  note: string;
  customerMessage?: string;
  aiReply?: string;
  bloco: string;
  titulo: string;
  conteudo: string;
  loading: boolean;
  saving: boolean;
  saved: boolean;
}

export function SimuladorChat({ enabled }: { enabled: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [mode, setMode] = useState<"cliente" | "chefe">("cliente");
  const [input, setInput] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rule, setRule] = useState<RuleCard | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollDown = () =>
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

  // histórico p/ a IA: cliente→user, ia→assistant (chefe NÃO entra).
  function historyFrom(list: Msg[]) {
    return list
      .filter((m) => m.kind === "cliente" || m.kind === "ia")
      .map((m) => ({ role: m.kind === "cliente" ? "user" : "assistant", content: m.content }));
  }

  async function callAgent(message: string, history: { role: string; content: string }[], supervisorNotes: string[]) {
    const res = await fetch("/api/support/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, supervisorNotes }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Erro na IA.");
    return json as { reply: string; escalated: boolean; usedTools: string[] };
  }

  async function sendCliente(text: string) {
    const history = historyFrom(msgs);
    setMsgs((m) => [...m, { kind: "cliente", content: text }]);
    setLoading(true);
    try {
      const r = await callAgent(text, history, notes);
      setMsgs((m) => [...m, { kind: "ia", content: r.reply, escalated: r.escalated, tools: r.usedTools }]);
      scrollDown();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha.");
    } finally {
      setLoading(false);
    }
  }

  async function sendChefe(note: string) {
    const nextNotes = [...notes, note];
    setNotes(nextNotes);
    setMsgs((m) => [...m, { kind: "chefe", content: note }]);

    // contexto: última msg do cliente e última resposta da IA
    const lastClienteIdx = [...msgs].map((m) => m.kind).lastIndexOf("cliente");
    const lastCliente = lastClienteIdx >= 0 ? msgs[lastClienteIdx].content : undefined;
    const lastIa = [...msgs].reverse().find((m) => m.kind === "ia")?.content;

    setLoading(true);
    setError(null);
    try {
      // 1) corrige na hora: refaz a última resposta ao cliente com a nova bronca
      if (lastCliente) {
        const history = historyFrom(msgs.slice(0, lastClienteIdx));
        const r = await callAgent(lastCliente, history, nextNotes);
        setMsgs((m) => [
          ...m,
          { kind: "ia", content: r.reply, escalated: r.escalated, tools: r.usedTools, corrigida: true },
        ]);
      }
      // 2) sugere a regra permanente
      setRule({
        note,
        customerMessage: lastCliente,
        aiReply: lastIa,
        bloco: "regras_ouro",
        titulo: "",
        conteudo: "",
        loading: true,
        saving: false,
        saved: false,
      });
      const res = await fetch("/api/support/suggest-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, customerMessage: lastCliente, aiReply: lastIa }),
      });
      const sug = await res.json();
      if (res.ok) {
        setRule((rc) =>
          rc ? { ...rc, bloco: sug.bloco, titulo: sug.titulo, conteudo: sug.conteudo, loading: false } : rc
        );
      } else {
        setRule((rc) => (rc ? { ...rc, loading: false, titulo: note, conteudo: note } : rc));
      }
      scrollDown();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha.");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    if (mode === "cliente") await sendCliente(text);
    else await sendChefe(text);
  }

  async function saveRule() {
    if (!rule) return;
    if (!rule.titulo.trim()) {
      setError("Dê um título à regra antes de salvar.");
      return;
    }
    setRule({ ...rule, saving: true });
    try {
      const res = await fetch("/api/support/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bloco: rule.bloco,
          titulo: rule.titulo,
          conteudo: rule.conteudo,
          ativo: true,
        }),
      });
      if (res.ok) setRule((rc) => (rc ? { ...rc, saving: false, saved: true } : rc));
      else {
        const j = await res.json();
        setError(j.error ?? "Erro ao salvar.");
        setRule((rc) => (rc ? { ...rc, saving: false } : rc));
      }
    } catch {
      setError("Falha ao salvar.");
      setRule((rc) => (rc ? { ...rc, saving: false } : rc));
    }
  }

  const isChefe = mode === "chefe";

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col h-[72vh]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && (
          <p className="text-sm text-slate-400">
            <strong>Como cliente</strong>, escreva como alguém no WhatsApp (ex.: &quot;até quando
            vai meu acesso? meu e-mail é fulano@email.com&quot;). Quando a IA responder, troque
            para <strong>Chefe</strong> e dê a correção (ex.: &quot;seja mais breve e nunca prometa
            reembolso&quot;) — a IA corrige na hora e sugere uma regra pra você salvar. O chefe
            não é visto pelo cliente.
          </p>
        )}
        {msgs.map((m, i) => {
          if (m.kind === "chefe") {
            return (
              <div key={i} className="flex justify-center">
                <div className="max-w-[90%] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <span className="font-semibold">👔 Chefe (cliente não vê):</span> {m.content}
                </div>
              </div>
            );
          }
          const isCliente = m.kind === "cliente";
          return (
            <div key={i} className={`flex ${isCliente ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                  isCliente ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-800"
                }`}
              >
                {m.corrigida && (
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                    ✏️ resposta corrigida
                  </div>
                )}
                {m.content}
                {m.kind === "ia" && (m.escalated || (m.tools && m.tools.length > 0)) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.escalated && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        escalado → fila humana
                      </span>
                    )}
                    {m.tools?.map((t, j) => (
                      <span key={j} className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-3.5 py-2 text-sm text-slate-400">pensando…</div>
          </div>
        )}

        {/* Cartão: salvar a bronca como regra permanente */}
        {rule && (
          <div className="rounded-xl border border-sky-300 bg-sky-50 p-3">
            {rule.loading ? (
              <p className="text-sm text-sky-800">Gerando sugestão de regra…</p>
            ) : rule.saved ? (
              <p className="text-sm font-medium text-emerald-700">
                ✅ Regra salva no treinamento — agora vale pra todos os atendimentos.{" "}
                <button onClick={() => setRule(null)} className="underline text-emerald-700">fechar</button>
              </p>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  Salvar como regra permanente?
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2">
                  <select
                    value={rule.bloco}
                    onChange={(e) => setRule({ ...rule, bloco: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {KB_BLOCOS.map((b) => (
                      <option key={b.key} value={b.key}>{b.label}</option>
                    ))}
                  </select>
                  <input
                    value={rule.titulo}
                    onChange={(e) => setRule({ ...rule, titulo: e.target.value })}
                    placeholder="Título da regra"
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <textarea
                  value={rule.conteudo}
                  onChange={(e) => setRule({ ...rule, conteudo: e.target.value })}
                  rows={3}
                  placeholder="Texto da regra (a IA vai seguir sempre)"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveRule}
                    disabled={rule.saving}
                    className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    {rule.saving ? "Salvando…" : "Salvar regra"}
                  </button>
                  <button
                    onClick={() => setRule(null)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <div className="px-4 py-2 text-sm text-rose-600 border-t border-slate-100">{error}</div>}

      <div className="border-t border-slate-200 p-3">
        {/* alterna quem está falando */}
        <div className="mb-2 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
          <button
            onClick={() => setMode("cliente")}
            className={`rounded-md px-3 py-1 font-medium ${
              !isChefe ? "bg-rose-600 text-white" : "text-slate-600"
            }`}
          >
            🧑 Cliente
          </button>
          <button
            onClick={() => setMode("chefe")}
            className={`rounded-md px-3 py-1 font-medium ${
              isChefe ? "bg-amber-500 text-white" : "text-slate-600"
            }`}
          >
            👔 Chefe
          </button>
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={!enabled || loading}
            placeholder={
              !enabled
                ? "IA desligada (configure ANTHROPIC_API_KEY)"
                : isChefe
                  ? "Correção pra IA (o cliente não vê)…"
                  : "Mensagem do cliente…"
            }
            className={`flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:bg-slate-50 ${
              isChefe ? "border-amber-300 focus:border-amber-500" : "border-slate-300 focus:border-rose-500"
            }`}
          />
          <button
            onClick={send}
            disabled={!enabled || loading}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              isChefe ? "bg-amber-500 hover:bg-amber-400" : "bg-rose-600 hover:bg-rose-500"
            }`}
          >
            Enviar
          </button>
        </div>
        {(msgs.length > 0 || notes.length > 0) && (
          <button
            onClick={() => {
              setMsgs([]);
              setNotes([]);
              setRule(null);
              setError(null);
            }}
            className="mt-2 text-xs text-slate-400 hover:text-slate-600"
          >
            Limpar treino
          </button>
        )}
      </div>
    </div>
  );
}
