"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Edição de um link já criado. O slug não aparece aqui: ele está impresso no QR
// e não pode mudar. O resto é justamente o que precisa mudar depois — o QR nasce
// antes do vídeo existir, então a URL do YouTube só é conhecida na publicação, e
// o destino pode trocar sem reimprimir nada.
export function EditLinkForm({
  slug,
  label,
  product,
  destination,
  utm_campaign,
  youtube_url,
}: {
  slug: string;
  label: string | null;
  product: string | null;
  destination: string;
  utm_campaign: string | null;
  youtube_url: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: label ?? "",
    product: product ?? "",
    destination,
    utm_campaign: utm_campaign ?? "",
    youtube_url: youtube_url ?? "",
  });

  const upd = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = "w-full rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm";
  const lbl = "block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1";

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/links?slug=${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? `Erro ${res.status}`);
        return;
      }
      setOpen(false);
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
        title="Editar link"
        className="shrink-0 rounded-md border border-slate-200 dark:border-white/10 px-2 py-1 text-xs text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
      >
        Editar
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={lbl}>URL do vídeo no YouTube</label>
          <input
            className={field}
            value={form.youtube_url}
            onChange={(e) => upd("youtube_url", e.target.value)}
            placeholder="cole aqui quando o vídeo for publicado"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>Destino — a landing page / lista de espera</label>
          <input
            className={field}
            value={form.destination}
            onChange={(e) => upd("destination", e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500">
            Pode mudar quando quiser — o QR aponta para cá, não para o destino.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>Apelido</label>
          <input className={field} value={form.label} onChange={(e) => upd("label", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Produto</label>
          <input className={field} value={form.product} onChange={(e) => upd("product", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Campanha (utm_campaign)</label>
          <input
            className={field}
            value={form.utm_campaign}
            onChange={(e) => upd("utm_campaign", e.target.value)}
          />
        </div>
      </div>

      <p className="text-[11px] text-slate-400 dark:text-zinc-500">
        O link curto <code>{slug}</code> não muda: ele já está no QR.
      </p>

      {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {busy ? "Salvando…" : "Salvar"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setErr(null);
          }}
          className="rounded-lg border border-slate-300 dark:border-white/15 px-4 py-2 text-sm text-slate-600 dark:text-zinc-400"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
