import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDashboardData } from "@/lib/data";
import { isMql } from "@/lib/origin";
import { num } from "@/lib/format";
import { Card, DemoBanner, PageHeader } from "@/components/ui";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import { CopyButton } from "@/components/CopyButton";
import { QrCode } from "@/components/QrCode";

export const dynamic = "force-dynamic";

// Base do link curto. O subdomínio link.* serve o slug na raiz (sem /r/),
// então o link público é base/<slug>. Trocável via NEXT_PUBLIC_SHORT_LINK_BASE.
const SHORT_BASE = (
  process.env.NEXT_PUBLIC_SHORT_LINK_BASE || "https://link.canaldoanfitriao.com.br"
).replace(/\/+$/, "");

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
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Crie o primeiro em <strong>+ Novo link / QR</strong>. Você escolhe um apelido
            (ex.: <em>sublocação-vídeo-junho</em>), o produto e a lista de destino; sai um
            link curto <code>{SHORT_BASE}/…</code> e um QR pra colocar no vídeo. O destino
            pode mudar depois sem reimprimir o QR.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((lk) => {
            const short = `${SHORT_BASE}/${lk.slug}`;
            const scans = scansBySlug.get(lk.slug) ?? 0;
            const lead = leadsBySlug.get(lk.slug) ?? { leads: 0, mql: 0 };
            const conv = scans > 0 ? (lead.leads / scans) * 100 : null;
            const yid = ytId(lk.youtube_url);
            return (
              <div
                key={lk.slug}
                className="bg-white dark:bg-[#15121f] rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-4 flex flex-col sm:flex-row gap-4"
              >
                <div className="shrink-0">
                  <QrCode value={short} size={96} filename={`qr-${lk.slug}.png`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 dark:text-zinc-100">{lk.label || lk.slug}</span>
                    {lk.product && (
                      <span className="rounded-full bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-400 text-[11px] px-2 py-0.5">
                        {lk.product}
                      </span>
                    )}
                    {lk.utm_source && (
                      <span className="rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px] px-2 py-0.5">
                        {lk.utm_source}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <code className="text-xs text-slate-500 dark:text-zinc-400 break-all">{short}</code>
                    <CopyButton text={short} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500 truncate">→ {lk.destination}</p>
                  <div className="mt-2 flex gap-5 text-sm tabular-nums">
                    <span>
                      <span className="font-semibold text-slate-900 dark:text-zinc-100">{num(scans)}</span>{" "}
                      <span className="text-slate-400 dark:text-zinc-500 text-xs">scans</span>
                    </span>
                    <span>
                      <span className="font-semibold text-slate-900 dark:text-zinc-100">{num(lead.leads)}</span>{" "}
                      <span className="text-slate-400 dark:text-zinc-500 text-xs">leads</span>
                    </span>
                    <span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{num(lead.mql)}</span>{" "}
                      <span className="text-slate-400 dark:text-zinc-500 text-xs">MQL</span>
                    </span>
                    {conv !== null && (
                      <span>
                        <span className="font-semibold text-slate-700 dark:text-zinc-300">{num(conv, 0)}%</span>{" "}
                        <span className="text-slate-400 dark:text-zinc-500 text-xs">scan→lead</span>
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
                      className="h-16 w-28 rounded-md object-cover bg-slate-100 dark:bg-white/[0.07]"
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
