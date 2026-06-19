"use client";

import { useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  escalated?: boolean;
  tools?: string[];
}

export function SimuladorChat({ enabled }: { enabled: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    const next = [...msgs, { role: "user" as const, content: text }];
    setMsgs(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/support/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro na IA.");
        return;
      }
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          content: json.reply,
          escalated: json.escalated,
          tools: json.usedTools,
        },
      ]);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch {
      setError("Falha de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && (
          <p className="text-sm text-slate-400">
            Escreva como se fosse um cliente no WhatsApp — ex.: &quot;Oi, queria saber
            até quando vai meu acesso. Meu e-mail é fulano@email.com&quot;. A IA usa o
            treinamento + a consulta do cliente pra responder ou escalar.
          </p>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-rose-600 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.content}
              {m.role === "assistant" && (m.escalated || (m.tools && m.tools.length > 0)) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.escalated && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      escalado → fila humana
                    </span>
                  )}
                  {m.tools?.map((t, j) => (
                    <span
                      key={j}
                      className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-3.5 py-2 text-sm text-slate-400">
              digitando…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="px-4 py-2 text-sm text-rose-600 border-t border-slate-100">{error}</div>
      )}

      <div className="border-t border-slate-200 p-3">
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
            placeholder={enabled ? "Mensagem do cliente…" : "IA desligada (configure ANTHROPIC_API_KEY)"}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none disabled:bg-slate-50"
          />
          <button
            onClick={send}
            disabled={!enabled || loading}
            className="shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
        {msgs.length > 0 && (
          <button
            onClick={() => {
              setMsgs([]);
              setError(null);
            }}
            className="mt-2 text-xs text-slate-400 hover:text-slate-600"
          >
            Limpar conversa
          </button>
        )}
      </div>
    </div>
  );
}
