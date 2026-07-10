import Link from "next/link";
import { num } from "@/lib/format";
import { getConversationsOverview, getResponseStats } from "@/lib/conversations";
import { waLink } from "@/lib/whatsapp";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import { DateRangePicker } from "@/components/DateRangePicker";

export const dynamic = "force-dynamic";

const OUTCOMES = [
  { v: "all", label: "Todas" },
  { v: "won", label: "Fecharam" },
  { v: "lost", label: "Não fecharam" },
  { v: "open", label: "Em aberto" },
];

// "Bola" = de quem é a próxima mensagem. Última mensagem do lead ('contact')
// significa que ele falou e está esperando o VENDEDOR responder.
const BOLAS = [
  { v: "all", label: "Todas" },
  { v: "vendedor", label: "🔴 Esperando o vendedor" },
  { v: "lead", label: "Com o lead" },
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

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return isNaN(ms) ? null : Math.max(0, Math.floor(ms / 86_400_000));
}

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{
    outcome?: string;
    seller?: string;
    bola?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = await searchParams;
  const outcome = sp.outcome ?? "all";
  const seller = sp.seller ?? "all";
  const bola = sp.bola ?? "all";
  const re = /^\d{4}-\d{2}(-\d{2})?$/;
  const from = sp.from && re.test(sp.from) ? sp.from : null;
  const to = sp.to && re.test(sp.to) ? sp.to : null;

  const href = (over: { outcome?: string; seller?: string; bola?: string }) => {
    const q = new URLSearchParams();
    q.set("outcome", over.outcome ?? outcome);
    q.set("seller", over.seller ?? seller);
    q.set("bola", over.bola ?? bola);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return `/conversas?${q.toString()}`;
  };

  const [all, stats] = await Promise.all([getConversationsOverview(), getResponseStats()]);

  const sellers = [...new Set(all.map((c) => c.seller).filter(Boolean) as string[])].sort();
  const isWaitingSeller = (c: (typeof all)[number]) =>
    c.outcome === "open" && c.last_sender === "contact";
  const rows = all.filter(
    (c) =>
      (outcome === "all" || c.outcome === outcome) &&
      (seller === "all" || c.seller === seller) &&
      (bola === "all" ||
        (bola === "vendedor" ? isWaitingSeller(c) : c.outcome === "open" && !isWaitingSeller(c))) &&
      (!from || (c.last_at != null && c.last_at.slice(0, from.length) >= from)) &&
      (!to || (c.last_at != null && c.last_at.slice(0, to.length) <= to))
  );

  // KPIs do dia: o backlog que fecha (ou perde) venda no WhatsApp.
  const open = all.filter((c) => c.outcome === "open");
  const waitingSeller = open.filter(isWaitingSeller);
  const waitingStale = waitingSeller.filter((c) => (daysSince(c.last_at) ?? 0) >= 3);
  const fast = stats.find((s) => s.bucket === "até 24h");
  const fastRate =
    fast && fast.won + fast.lost > 0 ? (100 * fast.won) / (fast.won + fast.lost) : null;

  const exportHref = `/api/export/conversas?outcome=${encodeURIComponent(outcome)}&seller=${encodeURIComponent(seller)}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  return (
    <div>
      <PageHeader
        title="Conversas do atendimento"
        subtitle="WhatsApp do time de vendas: de quem é a bola, quem está no vácuo e o perfil 360 pra análise"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <KpiCard label="Em aberto" value={num(open.length)} />
        <KpiCard
          label="Esperando o vendedor"
          value={num(waitingSeller.length)}
          hint="a última mensagem é do lead"
          tone={waitingSeller.length > 0 ? "warn" : "good"}
        />
        <KpiCard
          label="No vácuo há 3+ dias"
          value={num(waitingStale.length)}
          hint="lead falou e ninguém respondeu"
          tone={waitingStale.length > 0 ? "bad" : "good"}
        />
        <KpiCard
          label="Resposta em 24h fecha"
          value={fastRate !== null ? `${num(fastRate, 0)}%` : "—"}
          hint="das conversas decididas (histórico)"
          tone="good"
        />
      </div>

      {stats.length > 0 && (
        <Card title="Velocidade da 1ª resposta × fechamento (histórico completo)" className="mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
            {stats.map((s) => {
              const decided = s.won + s.lost;
              const rate = decided > 0 ? (100 * s.won) / decided : null;
              return (
                <div key={s.bucket} className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                  <div className="text-xs text-slate-500">1ª resposta em {s.bucket}</div>
                  <div
                    className={`text-xl font-bold tabular-nums mt-1 ${
                      rate === null
                        ? "text-slate-400"
                        : rate >= 40
                          ? "text-emerald-600"
                          : rate > 0
                            ? "text-amber-600"
                            : "text-rose-600"
                    }`}
                  >
                    {rate !== null ? `${num(rate, 0)}% fecham` : "sem decisão"}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {num(s.conversas)} conversas · {num(s.won)} fechadas
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            % sobre as conversas já decididas (fechou ÷ (fechou + não fechou)), pela demora da
            primeira resposta humana do vendedor (automação não conta). A lição do próprio
            histórico: depois de 3 dias sem resposta, praticamente nenhuma conversa fecha.
          </p>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Bola com</div>
            <div className="flex flex-wrap gap-2">
              {BOLAS.map((b) => (
                <Link key={b.v} href={href({ bola: b.v })} className={chip(bola === b.v)}>
                  {b.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Resultado</div>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <Link key={o.v} href={href({ outcome: o.v })} className={chip(outcome === o.v)}>
                  {o.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Vendedor</div>
            <div className="flex flex-wrap gap-2">
              <Link href={href({ seller: "all" })} className={chip(seller === "all")}>
                Todos
              </Link>
              {sellers.map((s) => (
                <Link key={s} href={href({ seller: s })} className={chip(seller === s)}>
                  {s}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Período (última atividade)</div>
            <DateRangePicker minYear={2024} />
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
                  <th className="py-2 font-medium">Bola com</th>
                  <th className="py-2 font-medium text-right">Msgs</th>
                  <th className="py-2 font-medium text-right">Última</th>
                  <th className="py-2 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const wa = waLink(c.phone);
                  const idle = daysSince(c.last_at);
                  const waiting = isWaitingSeller(c);
                  return (
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
                      <td className="py-1.5">
                        {c.outcome === "open" ? (
                          waiting ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                (idle ?? 0) >= 3
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              vendedor{idle !== null && idle > 0 ? ` · ${num(idle)}d` : ""}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">lead</span>
                          )
                        ) : (
                          <span className="text-[11px] text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">{num(c.msg_count ?? 0)}</td>
                      <td className="py-1.5 text-right text-slate-500 tabular-nums whitespace-nowrap">
                        {c.last_at ? new Date(c.last_at).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
                          >
                            💬 WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs text-slate-300">sem fone</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">
          “Bola com vendedor” = a última mensagem da conversa é do lead: ele falou e está
          esperando resposta. O botão abre a conversa direto no WhatsApp do contato.
        </p>
      </Card>
    </div>
  );
}
