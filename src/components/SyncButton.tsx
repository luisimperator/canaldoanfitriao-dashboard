"use client";

import { useState } from "react";

// Botão que dispara uma rota de sincronização (POST) e mostra o resultado.
export function SyncButton({ path, label = "Sincronizar agora" }: { path: string; label?: string }) {
  const [state, setState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setState("running");
    setMessage(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(json.error ?? `Erro ${res.status}`);
        return;
      }
      setState("ok");
      const base =
        typeof json.imported === "number"
          ? `${json.imported.toLocaleString("pt-BR")} registros importados`
          : "Sincronizado";
      const utm =
        typeof json.comUtm === "number"
          ? ` · ${json.comUtm.toLocaleString("pt-BR")} com origem (UTM)`
          : "";
      setMessage(base + utm);
    } catch {
      setState("error");
      setMessage("Falha de rede");
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={state === "running"}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {state === "running" ? "Sincronizando..." : label}
      </button>
      {message && (
        <span
          className={`ml-2 text-xs ${state === "error" ? "text-rose-600" : "text-emerald-600"}`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
