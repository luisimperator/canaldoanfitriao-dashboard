"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Lixeira / restaurar de um link rastreável. O delete é reversível: a linha vai
// para Deletados em vez de sumir, porque um QR impresso não volta atrás.
export function LinkTrashButton({
  slug,
  mode = "delete",
}: {
  slug: string;
  mode?: "delete" | "restore";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const qs =
        mode === "delete"
          ? `slug=${encodeURIComponent(slug)}`
          : `slug=${encodeURIComponent(slug)}&action=restore`;
      const res = await fetch(`/api/links?${qs}`, {
        method: mode === "delete" ? "DELETE" : "PATCH",
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (mode === "restore") {
    return (
      <button
        onClick={run}
        disabled={busy}
        className="shrink-0 rounded-md border border-slate-200 dark:border-white/10 px-2 py-1 text-xs text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.06] disabled:opacity-50"
      >
        {busy ? "…" : "Restaurar"}
      </button>
    );
  }

  if (confirming) {
    return (
      <span className="shrink-0 flex items-center gap-1">
        <button
          onClick={run}
          disabled={busy}
          className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {busy ? "…" : "Deletar"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-md border border-slate-200 dark:border-white/10 px-2 py-1 text-xs text-slate-500 dark:text-zinc-400"
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Deletar link"
      aria-label="Deletar link"
      className="shrink-0 rounded-md border border-slate-200 dark:border-white/10 p-1.5 text-slate-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-500/30"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}
