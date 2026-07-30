"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { brl } from "@/lib/format";

// Botão de cravar a distribuição. Aparece só a partir do dia do fechamento —
// o cron crava sozinho no meio do dia, isso aqui é pra fechar na hora que
// quiser (depois de conferir o caixa) sem esperar o robô.

export function FecharDistribuicao({ valor }: { valor: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fechar() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/financeiro/distribuicao/fechar", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? `Erro ${res.status}`);
        return;
      }
      router.refresh();
    } catch {
      setErr("Falha de rede");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-emerald-200/70 dark:border-emerald-500/20 pt-3">
      <button
        onClick={fechar}
        disabled={busy}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {busy ? "Cravando..." : `Cravar ${brl(valor)}`}
      </button>
      <span className="text-[11px] text-slate-500 dark:text-zinc-400">
        Hoje é o dia do fechamento — depois de cravar, o valor não muda mais.
      </span>
      {err && <span className="text-xs text-rose-600 dark:text-rose-400">{err}</span>}
    </div>
  );
}
