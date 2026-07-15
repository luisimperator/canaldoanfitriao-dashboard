"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SaidaProgramada } from "@/lib/provisao-caixa";
import { brl } from "@/lib/format";
import { dayLabel } from "@/components/ProvisaoTimeline";

// Pagamentos agendados na mão: lista + cadastro + remoção.
// Grava em provisao_saidas via /api/financeiro/provisao/saidas.

export function SaidasProgramadas({ saidas, hoje }: { saidas: SaidaProgramada[]; hoje: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ descricao: "", valor: "", data: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function adicionar() {
    const num = Number(form.valor.replace(/\./g, "").replace(",", "."));
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/financeiro/provisao/saidas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: form.descricao, valor: num, data: form.data }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? `Erro ${res.status}`);
        return;
      }
      setForm({ descricao: "", valor: "", data: "" });
      router.refresh();
    } catch {
      setErr("Falha de rede");
    } finally {
      setBusy(false);
    }
  }

  async function remover(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/financeiro/provisao/saidas?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const field =
    "rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-2.5 py-1.5 text-sm text-slate-900 dark:text-zinc-100";

  return (
    <div>
      {saidas.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500 dark:text-zinc-400">
          Nenhum pagamento agendado. Cadastre abaixo o que já está programado pra sair
          (boletos, distribuições, fornecedores) e ele entra no saldo projetado.
        </p>
      ) : (
        <div className="mb-3 space-y-2">
          {saidas.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {s.descricao}
                </div>
                <div className="text-xs text-slate-400 dark:text-zinc-500">{dayLabel(s.data, hoje)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">
                  − {brl(s.valor)}
                </span>
                <button
                  onClick={() => remover(s.id)}
                  disabled={busy}
                  title="Remover"
                  className="text-slate-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${field} w-full sm:w-64`}
          placeholder="Descrição (ex.: Boletos Camila)"
          value={form.descricao}
          onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
        />
        <input
          className={`${field} w-32`}
          inputMode="decimal"
          placeholder="Valor"
          value={form.valor}
          onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
        />
        <input
          className={`${field} w-40`}
          type="date"
          value={form.data}
          onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
        />
        <button
          onClick={adicionar}
          disabled={busy}
          className="rounded-lg bg-slate-900 dark:bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 dark:hover:bg-violet-500 disabled:opacity-60"
        >
          {busy ? "Salvando..." : "+ Agendar saída"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{err}</p>}
    </div>
  );
}
