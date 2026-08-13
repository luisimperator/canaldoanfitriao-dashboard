import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, PageHeader } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { LinkTrashButton } from "@/components/LinkTrashButton";
import { shortLinkBase, shortLinkFor } from "@/lib/short-link";

export const dynamic = "force-dynamic";

interface LinkRow {
  slug: string;
  label: string | null;
  product: string | null;
  destination: string;
  deleted_at: string;
}

export default async function LinksDeletadosPage() {
  const supabase = getSupabaseAdmin();
  const SHORT_BASE = await shortLinkBase();

  let links: LinkRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("tracked_links")
      .select("slug, label, product, destination, deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    links = (data as LinkRow[]) ?? [];
  }

  return (
    <div>
      <PageHeader
        title="Links deletados"
        subtitle="Nada some de verdade: um QR já impresso continua existindo no mundo, então o link fica guardado aqui e pode voltar para a lista a qualquer momento."
      />

      {links.length === 0 ? (
        <Card title="Nenhum link deletado">
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Quando você deletar um link em <strong>Links &amp; QR</strong>, ele aparece aqui.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((lk) => {
            const short = shortLinkFor(SHORT_BASE, lk.slug);
            return (
              <div
                key={lk.slug}
                className="bg-white dark:bg-[#15121f] rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-4"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 dark:text-zinc-100">
                    {lk.label || lk.slug}
                  </span>
                  {lk.product && (
                    <span className="rounded-full bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-400 text-[11px] px-2 py-0.5">
                      {lk.product}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                    deletado em {new Date(lk.deleted_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <code className="text-xs text-slate-500 dark:text-zinc-400 break-all">{short}</code>
                  <CopyButton text={short} />
                  <LinkTrashButton slug={lk.slug} mode="restore" />
                </div>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500 truncate">
                  → {lk.destination}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Link
          href="/links"
          className="text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 underline underline-offset-4"
        >
          ← Voltar para Links &amp; QR
        </Link>
      </div>
    </div>
  );
}
