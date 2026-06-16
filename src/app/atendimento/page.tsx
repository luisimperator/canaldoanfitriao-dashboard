import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { num } from "@/lib/format";
import { Card, KpiCard, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Ev {
  unnichat_id: string;
  name: string | null;
  stage: string | null;
  status: string | null;
  tags: string | null;
  event_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  frio: "Frio",
  lista_espera: "Lista de espera",
  quente: "Quente (em atendimento)",
  convertido: "Ganho",
  perdido: "Perdido",
};
// Ordem do funil de atendimento.
const FUNNEL = ["frio", "lista_espera", "quente", "convertido", "perdido"];
const BAR: Record<string, string> = {
  frio: "bg-slate-400",
  lista_espera: "bg-amber-500",
  quente: "bg-rose-500",
  convertido: "bg-emerald-500",
  perdido: "bg-slate-300",
};

async function getEvents(): Promise<Ev[] | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("lead_events")
    .select("unnichat_id,name,stage,status,tags,event_at")
    .order("event_at", { ascending: false })
    .limit(500);
  return (data ?? []) as Ev[];
}

function fmt(dt: string): string {
  return new Date(dt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AtendimentoPage() {
  const events = await getEvents();

  if (!events || events.length === 0) {
    return (
      <div>
        <PageHeader
          title="Atendimento (CRM ao vivo)"
          subtitle="Eventos do Unnichat: contato criado, mudança de etapa, ganho/perdido"
        />
        <Card>
          <p className="text-sm text-slate-600">
            Ainda não chegou nenhum evento do Unnichat. As automações postam aqui
            quando um contato é criado ou muda de etapa — assim que rodarem, aparece.
          </p>
        </Card>
      </div>
    );
  }

  const contatos = new Set(events.map((e) => e.unnichat_id)).size;
  const ultimo = events[0]?.event_at;

  // Status ATUAL de cada contato = status do evento mais recente dele
  // (events já vem ordenado do mais novo pro mais antigo).
  const latest = new Map<string, Ev>();
  for (const e of events) if (!latest.has(e.unnichat_id)) latest.set(e.unnichat_id, e);
  const byStatus: Record<string, number> = {};
  for (const e of latest.values()) {
    const s = e.status ?? "frio";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  const maxStatus = Math.max(1, ...Object.values(byStatus));
  const recent = events.slice(0, 25);

  return (
    <div>
      <PageHeader
        title="Atendimento (CRM ao vivo)"
        subtitle="Eventos do Unnichat: contato criado, mudança de etapa, ganho/perdido"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <KpiCard label="Contatos no CRM" value={num(contatos)} hint="com evento registrado" />
        <KpiCard label="Eventos recebidos" value={num(events.length)} hint="histórico imutável" />
        <KpiCard
          label="Último evento"
          value={ultimo ? fmt(ultimo) : "—"}
          hint="prova de que está vivo"
          tone="good"
        />
      </div>

      <Card title="Funil de atendimento (status atual dos contatos)" className="mb-4">
        <div className="space-y-3">
          {FUNNEL.filter((s) => byStatus[s]).map((s) => {
            const n = byStatus[s];
            const pct = (n / maxStatus) * 100;
            return (
              <div key={s}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700">{STATUS_LABEL[s] ?? s}</span>
                  <span className="font-semibold text-slate-900">{num(n)}</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${BAR[s] ?? "bg-slate-400"}`}
                    style={{ width: `${Math.max(3, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          A conversão entre etapas específicas (1º Contato → Qualificação → Negociação) entra
          quando o Unnichat enviar a etapa no corpo do webhook. Por enquanto, o funil é por status.
        </p>
      </Card>

      <Card title="Eventos recentes (ao vivo)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="py-2 font-medium">Quando</th>
                <th className="py-2 font-medium">Contato</th>
                <th className="py-2 font-medium">Etapa / estágio</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 text-slate-500 tabular-nums whitespace-nowrap">{fmt(e.event_at)}</td>
                  <td className="py-1.5 text-slate-700">{e.name ?? "—"}</td>
                  <td className="py-1.5 text-slate-600">{e.stage ?? e.tags ?? "—"}</td>
                  <td className="py-1.5">
                    <span className="text-xs font-medium text-slate-600">
                      {STATUS_LABEL[e.status ?? ""] ?? e.status ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
