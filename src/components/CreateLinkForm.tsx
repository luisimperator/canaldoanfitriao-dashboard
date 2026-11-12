"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ehFonteDeVideo, normUtm, PORTAS } from "@/lib/origens";
import { CopyButton } from "@/components/CopyButton";

// Form de criação de link curto rastreável. Posta em /api/links e atualiza a
// lista. O slug sai do apelido automaticamente. A origem (utm_source/medium)
// vem do dicionário de portas de entrada (lib/origens) — só "Outro" deixa
// digitar à mão.
const GRUPOS = [...new Set(PORTAS.map((p) => p.grupo))];

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
  const [portaId, setPortaId] = useState("yt-qr");
  const porta = PORTAS.find((p) => p.id === portaId) ?? null;

  const upd = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  function escolherPorta(id: string) {
    setPortaId(id);
    const p = PORTAS.find((x) => x.id === id);
    if (p) setForm((f) => ({ ...f, utm_source: p.source, utm_medium: p.medium }));
    else setForm((f) => ({ ...f, utm_source: "", utm_medium: "" }));
  }
  const video = ehFonteDeVideo(form.utm_source);
  const field = "w-full rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm";
  const lbl = "block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1";

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
    <div className="bg-white dark:bg-surface rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-5 space-y-3">
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
            onBlur={(e) => upd("utm_campaign", normUtm(e.target.value))}
            placeholder={portaId === "vendedor" ? "ex.: breno" : "ex.: black-2026"}
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
        <div className="sm:col-span-2">
          <label className={lbl}>Onde o link vai ser usado</label>
          <select className={field} value={portaId} onChange={(e) => escolherPorta(e.target.value)}>
            {GRUPOS.map((g) => (
              <optgroup key={g} label={g}>
                {PORTAS.filter((p) => p.grupo === g).map((p) => (
                  <option key={p.id} value={p.id}>
                    {g} · {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value="outro">Outro (digitar a origem)</option>
          </select>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500">
            {porta ? (
              <>
                origem gravada: <code>{porta.source}</code> / <code>{porta.medium}</code>
              </>
            ) : (
              "Use só se nenhuma opção servir — o painel pode não reconhecer o canal."
            )}
          </p>
          {porta?.dica && (
            <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              <p>{porta.dica}</p>
              {porta.copiar && (
                <div className="mt-1.5 flex items-start gap-2">
                  <code className="flex-1 break-all text-[11px]">{porta.copiar}</code>
                  <CopyButton text={porta.copiar} />
                </div>
              )}
            </div>
          )}
        </div>
        {!porta && (
          <>
            <div>
              <label className={lbl}>Canal (utm_source)</label>
              <input
                className={field}
                value={form.utm_source}
                onChange={(e) => upd("utm_source", e.target.value)}
                onBlur={(e) => upd("utm_source", normUtm(e.target.value))}
                placeholder="ex.: tiktok"
              />
            </div>
            <div>
              <label className={lbl}>Tipo (utm_medium)</label>
              <input
                className={field}
                value={form.utm_medium}
                onChange={(e) => upd("utm_medium", e.target.value)}
                onBlur={(e) => upd("utm_medium", normUtm(e.target.value))}
                placeholder="ex.: bio"
              />
            </div>
          </>
        )}
        {video && (
        <div className="sm:col-span-2">
          <label className={lbl}>
            URL do vídeo no YouTube <span className="font-normal text-slate-400 dark:text-zinc-500">(opcional, pra mostrar a miniatura depois do upload)</span>
          </label>
          <input
            className={field}
            value={form.youtube_url}
            onChange={(e) => upd("youtube_url", e.target.value)}
            placeholder="cole depois que o vídeo subir"
          />
        </div>
        )}
      </div>
      {err && <p className="text-xs text-rose-600 dark:text-rose-400">{err}</p>}
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
          className="rounded-lg border border-slate-300 dark:border-white/15 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
