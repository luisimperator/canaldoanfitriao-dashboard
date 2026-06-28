"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// Gerador/padronizador de links com UTM. O objetivo é que TODO link e QR code
// (vídeo, bio, e-mail, anúncio) use o mesmo vocabulário, pra leitura de origem
// não virar sopa. Os valores sugeridos saem do que já existe na base.

const SOURCES = [
  "youtube",
  "instagram",
  "facebook",
  "tiktok",
  "podcast",
  "email",
  "whatsapp",
  "google",
  "organico",
  "indicacao",
];

const MEDIUMS = [
  { v: "organico", h: "vídeo/post não pago" },
  { v: "pago", h: "anúncio (tráfego pago)" },
  { v: "qr", h: "QR code (no vídeo, no slide)" },
  { v: "bio", h: "link na bio" },
  { v: "descricao", h: "descrição do vídeo" },
  { v: "story", h: "stories" },
  { v: "email", h: "e-mail / newsletter" },
];

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function UtmBuilderPage() {
  const [base, setBase] = useState("https://canaldoanfitriao.com.br/lista");
  const [source, setSource] = useState("youtube");
  const [medium, setMedium] = useState("organico");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [vidorigem, setVidorigem] = useState("");
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    let u: URL | null = null;
    try {
      u = new URL(base.trim());
    } catch {
      return "";
    }
    const set = (k: string, v: string) => {
      const val = v.trim();
      if (val) u!.searchParams.set(k, val);
    };
    set("utm_source", slug(source));
    set("utm_medium", slug(medium));
    set("utm_campaign", slug(campaign));
    set("utm_content", slug(content));
    if (vidorigem.trim()) u.searchParams.set("vidorigem", vidorigem.trim());
    return u.toString();
  }, [base, source, medium, campaign, content, vidorigem]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1";

  return (
    <div>
      <div className="mb-4">
        <Link href="/origem" className="text-sm text-rose-600 hover:underline">
          ← Origem dos leads
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Gerador de link com UTM</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Use o mesmo padrão em todo link e QR code. Assim a página de Origem
        consegue dizer exatamente o que trouxe cada lead.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div>
            <label className={labelCls}>URL da página (lista de espera / LP)</label>
            <input className={field} value={base} onChange={(e) => setBase(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Canal (utm_source)</label>
              <input
                className={field}
                list="utm-sources"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
              <datalist id="utm-sources">
                {SOURCES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Tipo (utm_medium)</label>
              <select className={field} value={medium} onChange={(e) => setMedium(e.target.value)}>
                {MEDIUMS.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.v} — {m.h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>
              Campanha / lançamento (utm_campaign){" "}
              <span className="font-normal text-slate-400">ex.: sad-jan-2026, gigantes-abr26</span>
            </label>
            <input className={field} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>
              Vídeo / criativo (utm_content){" "}
              <span className="font-normal text-slate-400">o que aparece pra pessoa</span>
            </label>
            <input className={field} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>
              Vídeo de origem (vidorigem){" "}
              <span className="font-normal text-slate-400">id do YouTube ou handle do podcast</span>
            </label>
            <input
              className={field}
              value={vidorigem}
              onChange={(e) => setVidorigem(e.target.value)}
              placeholder="ex.: HMKWQZFjgzY ou yt_podcast_nataliatendeiro"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Link pronto
            </p>
            {url ? (
              <p className="break-all text-sm text-slate-800">{url}</p>
            ) : (
              <p className="text-sm text-rose-600">URL inválida — confira o endereço da página.</p>
            )}
            <button
              onClick={copy}
              disabled={!url}
              className="mt-3 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {copied ? "Copiado ✓" : "Copiar link"}
            </button>
            {url && (
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
                  url
                )}`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 inline-block rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Gerar QR code
              </a>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-xs leading-relaxed text-slate-600">
            <p className="font-semibold text-slate-700 mb-1">O padrão, em uma linha:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong>utm_source</strong> = a plataforma (youtube, instagram, facebook…).
              </li>
              <li>
                <strong>utm_medium</strong> = como (organico, pago, qr, bio, email…).
              </li>
              <li>
                <strong>utm_campaign</strong> = o lançamento (use o mesmo nome da tag, ex.
                sad-jan-2026).
              </li>
              <li>
                <strong>utm_content</strong> + <strong>vidorigem</strong> = o vídeo/criativo
                específico — é o que diz “qual conteúdo converte”.
              </li>
            </ul>
            <p className="mt-2">
              Tudo minúsculo e sem acento (o gerador já normaliza). Mantido igual em todo
              QR/link, a página de Origem mostra ranking por canal, campanha e vídeo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
