import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDashboardData } from "@/lib/data";
import { isMql } from "@/lib/origin";
import { num } from "@/lib/format";
import { Card, DemoBanner, PageHeader } from "@/components/ui";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import { CopyButton } from "@/components/CopyButton";

export const dynamic = "force-dynamic";

// Base do link curto: se NEXT_PUBLIC_SHORT_LINK_BASE estiver setado (domínio
// bonito), usa ele; senão usa o domínio onde o painel está servindo de fato
// (o subdomínio do Vercel) — assim o QR nunca sai quebrado, mesmo sem o apex
// canaldoanfitriao.com.br encaminhar /r/ ainda.
async function shortBase(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SHORT_LINK_BASE;
  if (env) return env.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://canaldoanfitriao.com.br";
}

interface LinkRow {
  slug: string;
  label: string | null;
  product: string | null;
  destination: string;
  utm_source: string | null;
  utm_medium: string | null;
  youtube_url: string | null;
  created_at: string;
}

function ytId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : /^[A-Za-z0-9_-]{11}$/.test(url) ? url : null;
}

export default async function LinksPage() {
  const supabase = getSupabaseAdmin();
  const data = await getDashboardData();
  const SHORT_BASE = await shortBase();

  let links: LinkRow[] = [];
  const scansBySlug = new Map<string, number>();
  if (supabase) {
    const { data: l } = await supabase
      .from("tracked_links")
      .select("slug, label, product, destination, utm_source, utm_medium, youtube_url, created_at")
      .order("created_at", { ascending: false });
    links = (l as LinkRow[]) ?? [];
    const { data: s } = await supabase.from("link_scans").select("slug");
    for (const r of (s as { slug: string }[]) ?? [])
      scansBySlug.set(r.slug, (scansBySlug.get(r.slug) ?? 0) + 1);
  }

  // leads/MQL por slug (o redirect grava vidorigem = slug).
  const leadsBySlug = new Map<string, { leads: number; mql: number }>();
  for (const lead of data.leads) {
    const slug = lead.utm?.vidorigem?.trim() || lead.utm?.content?.trim();
    if (!slug) continue;
    const e = leadsBySlug.get(slug) ?? { leads: 0, mql: 0 };
    e.leads += 1;
    if (isMql(lead)) e.mql += 1;
    leadsBySlug.set(slug, e);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Links & QR rastreáveis"
          subtitle="Um link curto por QR/momento. O QR aponta pra cá; aqui ele ganha os UTMs e vai pra LP — então dá pra criar o QR antes do vídeo existir e medir scan → lead → MQL."
        />
        <CreateLinkForm />
      </div>
      <DemoBanner show={data.isDemo} />

      {links.length === 0 ? (
        <Card title="Nenhum link ainda">
          <p className="text-sm text-slate-600">
            Crie o primeiro em <strong>+ Novo link / QR</strong>. Você escolhe um apelido
            (ex.: <em>sublocação-vídeo-junho</em>), o produto e a lista de destino; sai um
            link curto <code>{SHORT_BASE}/r/…</code> e um QR pra colocar no vídeo. O destino
            pode mudar depois sem reimprimir o QR.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((lk) => {
            const short = `${SHORT_BASE}/r/${lk.slug}`;
            const scans = scansBySlug.get(lk.slug) ?? 0;
            const lead = leadsBySlug.get(lk.slug) ?? { leads: 0, mql: 0 };
            const conv = scans > 0 ? (lead.leads / scans) * 100 : null;
            const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(short)}`;
            const yid = ytId(lk.youtube_url);
            return (
              <div
                key={lk.slug}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row gap-4"
              >
                <a href={qr} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt={`QR ${lk.slug}`} className="h-24 w-24 rounded-md border border-slate-100" />
                </a>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{lk.label || lk.slug}</span>
                    {lk.product && (
                      <span className="rounded-full bg-slate-100 text-slate-600 text-[11px] px-2 py-0.5">
                        {lk.product}
                      </span>
                    )}
                    {lk.utm_source && (
                      <span className="rounded-full bg-rose-50 text-rose-600 text-[11px] px-2 py-0.5">
                        {lk.utm_source}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <code className="text-xs text-slate-500 break-all">{short}</code>
                    <CopyButton text={short} />
                    <a
                      href={qr}
                      download={`qr-${lk.slug}.png`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Baixar QR
                    </a>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400 truncate">→ {lk.destination}</p>
                  <div className="mt-2 flex gap-5 text-sm tabular-nums">
                    <span>
                      <span className="font-semibold text-slate-900">{num(scans)}</span>{" "}
                      <span className="text-slate-400 text-xs">scans</span>
                    </span>
                    <span>
                      <span className="font-semibold text-slate-900">{num(lead.leads)}</span>{" "}
                      <span className="text-slate-400 text-xs">leads</span>
                    </span>
                    <span>
                      <span className="font-semibold text-emerald-600">{num(lead.mql)}</span>{" "}
                      <span className="text-slate-400 text-xs">MQL</span>
                    </span>
                    {conv !== null && (
                      <span>
                        <span className="font-semibold text-slate-700">{num(conv, 0)}%</span>{" "}
                        <span className="text-slate-400 text-xs">scan→lead</span>
                      </span>
                    )}
                  </div>
                </div>
                {yid && (
                  <a href={`https://youtu.be/${yid}`} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${yid}/mqdefault.jpg`}
                      alt=""
                      className="h-16 w-28 rounded-md object-cover bg-slate-100"
                    />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
