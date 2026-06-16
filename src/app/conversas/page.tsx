import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { num } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Conv {
  contact_id: string;
  contact_name: string | null;
  seller: string | null;
  outcome: string | null;
  msg_count: number | null;
  last_at: string | null;
  email: string | null;
}

const OUTCOMES = [
  { v: "all", label: "Todas" },
  { v: "won", label: "Fecharam" },
  { v: "lost", label: "Não fecharam" },
  { v: "open", label: "Em aberto" },
];

const OUTCOME_BADGE: Record<string, string> = {
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-rose-100 text-rose-700",
  open: "bg-slate-100 text-slate-600",
};

function chip(active: boolean): string {
  return `rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
    active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
  }`;
}

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string; seller?: string }>;
}) {
  const sp = await searchParams;
  const outcome = sp.outcome ?? "all";
  const seller = sp.seller ?? "all";

  const admin = getSupabaseAdmin();
  const { data } = admin
    ? await admin
        .from("conversations")
        .select("contact_id,contact_name,seller,outcome,msg_count,last_at,email")
        .order("last_at", { ascending: false, nullsFirst: false })
    : { data: [] };
  const all = (data ?? []) as Conv[];

  const sellers = [...new Set(all.map((c) => c.seller).filter(Boolean) as string[])].sort();
  const rows = all.filter(
    (c) => (outcome === "all" || c.outcome === outcome) && (seller === "all" || c.seller === seller)
  );

  const exportHref = `/api/export/conversas?outcome=${encodeURIComponent(outcome)}&seller=${encodeURIComponent(seller)}`;

  return (
    <div>
      <PageHeader
        title="Conversas do atendimento"
        subtitle="Filtre por resultado e vendedor e exporte o perfil 360 (Unnichat + Mailchimp + Eduzz) pra análise"
      />

      <Card className="mb-4">
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Resultado</div>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <Link key={o.v} href={`/conversas?outcome=${o.v}&seller=${seller}`} className={chip(outcome === o.v)}>
                  {o.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Vendedor</div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/conversas?outcome=${outcome}&seller=all`} className={chip(seller === "all")}>
                Todos
              </Link>
              {sellers.map((s) => (
                <Link key={s} href={`/conversas?outcome=${outcome}&seller=${encodeURIComponent(s)}`} className={chip(seller === s)}>
                  {s}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-500">
              {num(rows.length)} conversa(s) no filtro
            </span>
            <a
              href={exportHref}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
            >
              ↓ Exportar (.md p/ o Claude)
            </a>
          </div>
        </div>
      </Card>

      <Card title="Conversas">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nenhuma conversa nesse filtro ainda. A coleta puxa as conversas dos contatos atendidos
            (via API do Unnichat) e roda a cada 3h — vai enchendo conforme o time atende.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 font-medium">Contato</th>
                  <th className="py-2 font-medium">Vendedor</th>
                  <th className="py-2 font-medium">Resultado</th>
                  <th className="py-2 font-medium text-right">Msgs</th>
                  <th className="py-2 font-medium text-right">Última</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.contact_id} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 text-slate-700">{c.contact_name ?? "—"}</td>
                    <td className="py-1.5 text-slate-600">{c.seller ?? "—"}</td>
                    <td className="py-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          OUTCOME_BADGE[c.outcome ?? "open"] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {c.outcome === "won" ? "Fechou" : c.outcome === "lost" ? "Não fechou" : "Em aberto"}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">{num(c.msg_count ?? 0)}</td>
                    <td className="py-1.5 text-right text-slate-500 tabular-nums whitespace-nowrap">
                      {c.last_at ? new Date(c.last_at).toLocaleDateString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
