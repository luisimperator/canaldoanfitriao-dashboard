import { listIntegrations } from "@/lib/integrations";
import { Card, PageHeader } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";
import { MailchimpTagsButton } from "@/components/MailchimpTagsButton";

export const dynamic = "force-dynamic";

export default function IntegracoesPage() {
  const integrations = listIntegrations();
  return (
    <div>
      <PageHeader
        title="Integrações"
        subtitle="De onde vem cada dado do dashboard e o que falta conectar"
      />
      <div className="grid md:grid-cols-2 gap-4">
        {integrations.map((item) => (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{item.name}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{item.role}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  item.configured
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 text-slate-500 border border-slate-200"
                }`}
              >
                {item.configured ? "Conectada" : "Pendente"}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-3">{item.howItWorks}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.envVars.map((v) => (
                <code
                  key={v}
                  className="text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-500"
                >
                  {v}
                </code>
              ))}
            </div>
            {item.configured && item.syncPath && <SyncButton path={item.syncPath} />}
            {item.configured && item.id === "mailchimp" && <MailchimpTagsButton />}
          </Card>
        ))}
      </div>
    </div>
  );
}
