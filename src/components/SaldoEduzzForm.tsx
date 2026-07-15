"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// A Eduzz não expõe o saldo via API, então ele entra como âncora manual:
// você informa o valor de hoje e o painel soma sozinho o que liberar depois.
// Grava em provisao_ajustes via /api/financeiro/provisao.

export function SaldoEduzzForm({ atual }: { atual: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(atual == null);
  const [valor, setValor] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function salvar() {
    const num = Number(valor.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(num) || num < 0) {
      setErr("Valor inválido — use ex.: 45000,00");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/financeiro/provisao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor: num }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? `Erro ${res.status}`);
        return;
      }
      setOpen(false);
      setValor("");
      router.refresh();
    } catch {
      setErr("Falha de rede");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
      >
        ajustar saldo Eduzz
      </button>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <input
        inputMode="decimal"
        placeholder="saldo Eduzz hoje, ex.: 45000,00"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="w-44 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-2.5 py-1.5 text-xs text-slate-900 dark:text-zinc-100"
      />
      <button
        onClick={salvar}
        disabled={busy}
        className="rounded-lg bg-slate-900 dark:bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 dark:hover:bg-violet-500 disabled:opacity-60"
      >
        {busy ? "Salvando..." : "Salvar"}
      </button>
      {atual != null && (
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 dark:text-zinc-400 hover:underline"
        >
          cancelar
        </button>
      )}
      {err && <span className="text-xs text-rose-600 dark:text-rose-400">{err}</span>}
    </div>
  );
}
