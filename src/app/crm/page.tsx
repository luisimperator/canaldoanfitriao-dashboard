import { getDashboardData } from "@/lib/data";
import { num } from "@/lib/format";
import { Card, DemoBanner, PageHeader } from "@/components/ui";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

// Ordem das colunas espelhando o pipeline do Unnichat;
// etapas novas/desconhecidas entram no fim, na ordem alfabética.
const STAGE_ORDER = [
  "1º Contato",
  "Qualificação",
  "Leads Muito Frios",
  "Leads Frios",
  "Leads Quentes",
  "Leads Muito Quentes",
  "Negociação",
  "Follow up manual",
  "Follow up de vendas",
  "Aguardando pagamento",
  "Não Respondeu Primeiro Contato",
  "Ganhou",
  "Perdeu",
];

const STATUS_DOT: Record<string, string> = {
  frio: "bg-slate-400",
  lista_espera: "bg-amber-400",
  quente: "bg-orange-500",
  convertido: "bg-emerald-500",
  perdido: "bg-rose-500",
};

const MAX_CARDS = 25;

export default async function CrmPage() {
  const data = await getDashboardData();
  const sellerName = new Map(data.sellers.map((s) => [s.id, s.name]));

  const byStage = new Map<string, Lead[]>();
  for (const lead of data.leads) {
    if (!lead.pipelineStage) continue;
    const list = byStage.get(lead.pipelineStage) ?? [];
    list.push(lead);
    byStage.set(lead.pipelineStage, list);
  }

  const knownStages = STAGE_ORDER.filter((s) => byStage.has(s));
  const unknownStages = [...byStage.keys()]
    .filter((s) => !STAGE_ORDER.includes(s))
    .sort();
  const stages = [...knownStages, ...unknownStages];

  return (
    <div>
      <PageHeader
        title="CRM"
        subtitle="Espelho do pipeline do Unnichat: contatos por etapa e responsável por cada um"
      />
      <DemoBanner show={data.isDemo} />

      {stages.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Nenhum contato com etapa do CRM ainda. Assim que as automações de
            etapa do Unnichat dispararem, o quadro aparece aqui sozinho.
          </p>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
          {stages.map((stage) => {
            const leads = byStage.get(stage)!;
            return (
              <section
                key={stage}
                className="w-64 shrink-0 rounded-xl bg-slate-100 border border-slate-200"
              >
                <header className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
                  <h2 className="text-xs font-semibold text-slate-700 truncate">{stage}</h2>
                  <span className="ml-2 shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">
                    {num(leads.length)}
                  </span>
                </header>
                <div className="p-2 space-y-2">
                  {leads.slice(0, MAX_CARDS).map((lead) => {
                    const responsavel =
                      (lead.sellerId && sellerName.get(lead.sellerId)) ||
                      (typeof lead.extra?.atendente === "string"
                        ? lead.extra.atendente
                        : null);
                    return (
                      <div
                        key={lead.id}
                        className="rounded-lg bg-white border border-slate-200 p-2.5"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[lead.status] ?? "bg-slate-300"}`}
                          />
                          <span className="text-xs font-medium text-slate-900 truncate">
                            {lead.name || lead.phone || "Contato"}
                          </span>
                        </div>
                        {lead.phone && lead.name && (
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {lead.phone}
                          </div>
                        )}
                        {responsavel && (
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            👤 {responsavel}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {leads.length > MAX_CARDS && (
                    <div className="text-center text-[11px] text-slate-400 py-1">
                      + {num(leads.length - MAX_CARDS)} contatos
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Cores: <span className="text-slate-500">● frio</span> ·{" "}
        <span className="text-amber-500">● lista de espera</span> ·{" "}
        <span className="text-orange-500">● quente</span> ·{" "}
        <span className="text-emerald-500">● convertido</span> ·{" "}
        <span className="text-rose-500">● perdido</span>. O quadro é um espelho
        de consulta — a gestão dos contatos continua no Unnichat.
      </p>
    </div>
  );
}
