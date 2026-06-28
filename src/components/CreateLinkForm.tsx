"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Form de criação de link curto rastreável. Posta em /api/links e atualiza a
// lista. O slug sai do apelido automaticamente.
const SOURCES = ["youtube", "instagram", "facebook", "podcast", "email", "whatsapp"];
const MEDIUMS = [
  { v: "qr", h: "QR code (no vídeo/slide)" },
  { v: "organico", h: "link orgânico (descrição/bio)" },
  { v: "pago", h: "anúncio" },
];

export function CreateLinkForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    product: "",
    destination: "https://canaldoanfitriao.com.br/lista",
    utm_source: "youtube",
    utm_medium: "qr",
    utm_campaign: "",
    youtube_url: "",
  });

  const upd = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const lbl = "block text-xs font-semibold text-slate-600 mb-1";

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? `Erro ${res.status}`);
        return;
      }
      setForm((f) => ({ ...f, label: "", product: "", utm_campaign: "", youtube_url: "" }));
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
        className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
      >
        + Novo link / QR
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={lbl}>Apelido (vira o nome do link e o rastreio)</label>
          <input
            className={field}
            value={form.label}
            onChange={(e) => upd("label", e.target.value)}
            placeholder="ex.: Comercial sublocação - vídeo de junho"
          />
        </div>
        <div>
          <label className={lbl}>Produto</label>
          <input
            className={field}
            value={form.product}
            onChange={(e) => upd("product", e.target.value)}
            placeholder="ex.: Gigantes / A5E / Ingresso"
          />
        </div>
        <div>
          <label className={lbl}>Campanha (utm_campaign)</label>
          <input
            className={field}
            value={form.utm_campaign}
            onChange={(e) => upd("utm_campaign", e.target.value)}
            placeholder="ex.: gigantes-abr26"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>Destino — a landing page / lista de espera</label>
          <input
            className={field}
            value={form.destination}
            onChange={(e) => upd("destination", e.target.value)}
          />
        </div>
        <div>
          <label className={lbl}>Canal (utm_source)</label>
          <input className={field} list="lk-src" value={form.utm_source} onChange={(e) => upd("utm_source", e.target.value)} />
          <datalist id="lk-src">
            {SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={lbl}>Tipo (utm_medium)</label>
          <select className={field} value={form.utm_medium} onChange={(e) => upd("utm_medium", e.target.value)}>
            {MEDIUMS.map((m) => (
              <option key={m.v} value={m.v}>
                {m.v} — {m.h}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>
            URL do vídeo no YouTube <span className="font-normal text-slate-400">(opcional, pra mostrar a miniatura depois do upload)</span>
          </label>
          <input
            className={field}
            value={form.youtube_url}
            onChange={(e) => upd("youtube_url", e.target.value)}
            placeholder="cole depois que o vídeo subir"
          />
        </div>
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
        >
          {busy ? "Criando..." : "Criar link + QR"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
