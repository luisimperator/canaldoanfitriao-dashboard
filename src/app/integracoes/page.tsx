import { listIntegrations } from "@/lib/integrations";
import { getIntegrationsHealth } from "@/lib/integrations/health";
import { Card, PageHeader } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";
import { MailchimpTagsButton } from "@/components/MailchimpTagsButton";

export const dynamic = "force-dynamic";

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function IntegracoesPage() {
  const integrations = listIntegrations();
  const health = await getIntegrationsHealth();

  return (
    <div>
      <PageHeader
        title="Integrações"
        subtitle="De onde vem cada dado do dashboard e o que está realmente chegando"
      />
      <div className="grid md:grid-cols-2 gap-4">
        {integrations.map((item) => {
          const h = health?.byId[item.id];
          // Selo honesto: dado real manda. Se está chegando dado, é "Recebendo"
          // mesmo que a credencial não esteja no Vercel (ex.: sync nativo no
          // Supabase). Senão, cai pra Pendente/Configurada/Sem dados.
          let badge: { label: string; cls: string };
          if (h?.hasData) {
            badge = { label: "Recebendo dados", cls: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30" };
          } else if (!item.configured) {
            badge = { label: "Pendente", cls: "bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-white/10" };
          } else if (!health) {
            badge = { label: "Configurada", cls: "bg-blue-50 text-blue-700 border-blue-200" };
          } else {
            badge = { label: "Sem dados", cls: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30" };
          }
          return (
            <Card key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{item.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{item.role}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold border ${badge.cls}`}
                >
                  {badge.label}
                </span>
              </div>

              {h && (
                <p
                  className={`mt-2 text-xs font-medium ${
                    h.hasData ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {h.detail}
                </p>
              )}

              <p className="text-sm text-slate-600 dark:text-zinc-400 mt-3">{item.howItWorks}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.envVars.map((v) => (
                  <code
                    key={v}
                    className="text-[11px] bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded px-1.5 py-0.5 text-slate-500 dark:text-zinc-400"
                  >
                    {v}
                  </code>
                ))}
              </div>
              {item.configured && item.syncPath && <SyncButton path={item.syncPath} />}
              {item.configured && item.id === "mailchimp" && <MailchimpTagsButton />}
            </Card>
          );
        })}
      </div>

      {/* Diagnóstico: o que chegou de verdade nos webhooks, em tempo (quase) real */}
      {health && (
        <Card title="Últimos eventos recebidos (webhooks)" className="mt-4">
          {health.recentEvents.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-zinc-400">
              Nenhum evento de webhook recebido ainda. Quando Eduzz, Unnichat ou
              TMB chamarem a URL, aparece aqui — inclusive tentativas com chave
              errada, para ajudar a achar o problema.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {health.recentEvents.map((e, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-white/[0.04] last:border-0">
                    <td className="py-1.5 pr-2">
                      <span className="inline-block rounded bg-slate-100 dark:bg-white/[0.07] px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase">
                        {e.source}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-slate-600 dark:text-zinc-400">{e.note ?? "—"}</td>
                    <td className="py-1.5 text-right text-slate-400 dark:text-zinc-500 whitespace-nowrap w-24">
                      {fmtWhen(e.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
