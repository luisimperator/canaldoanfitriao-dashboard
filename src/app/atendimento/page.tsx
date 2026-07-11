import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { brl, num } from "@/lib/format";
import { Card, KpiCard, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

interface CrmFunnel {
  as_of: string;
  totals: {
    deals: number;
    abertos: number;
    valor_aberto: number;
    ganhos: number;
    valor_ganho: number;
    perdas: number;
    valor_perdido: number;
    win_rate: number;
  };
  stages: { etapa: string; count: number; valor: number; dias_mediana: number | null }[];
  by_atendente: { nome: string; count: number; valor: number }[];
  motivos_perda: { razao: string; count: number }[];
}
interface Ev {
  unnichat_id: string;
  name: string | null;
  stage: string | null;
  status: string | null;
  event_at: string;
}
interface ClosingRow {
  seller: string;
  period: string;
  passaram: number;
  fecharam: number;
  taxa: number | null;
}

async function getData(): Promise<{
  crm: CrmFunnel | null;
  events: Ev[];
  closing: ClosingRow[];
}> {
  const admin = getSupabaseAdmin();
  if (!admin) return { crm: null, events: [], closing: [] };
  const [snap, ev, cr] = await Promise.all([
    admin.from("analytics_snapshot").select("data").eq("key", "crm_funnel").maybeSingle(),
    admin
      .from("lead_events")
      .select("unnichat_id,name,stage,status,event_at")
      .order("event_at", { ascending: false })
      .limit(15),
    admin.rpc("seller_closing_rate", { p_unit: "week" }),
  ]);
  return {
    crm: (snap.data?.data ?? null) as CrmFunnel | null,
    events: (ev.data ?? []) as Ev[],
    closing: (cr.data ?? []) as ClosingRow[],
  };
}

// Etapas "paradas" (gargalo) vs "quentes" (perto do fechamento).
function stageColor(etapa: string): string {
  const e = etapa.toLowerCase();
  if (e.includes("não respondeu") || e.includes("nao respondeu")) return "bg-rose-500";
  if (e.includes("negocia") || e.includes("pagamento")) return "bg-emerald-500";
  if (e.includes("frio")) return "bg-sky-400";
  return "bg-amber-500";
}

function fmt(dt: string): string {
  return new Date(dt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function FunilCrmPage() {
  const { crm, events, closing } = await getData();

  if (!crm) {
    return (
      <div>
        <PageHeader title="Funil CRM (Unnichat)" subtitle="Pipeline de vendas, etapa a etapa" />
        <Card>
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Sem snapshot do pipeline ainda. Ele vem do export do CRM do Unnichat.
          </p>
        </Card>
      </div>
    );
  }

  const t = crm.totals;
  const maxCount = Math.max(1, ...crm.stages.map((s) => s.count));

  return (
    <div>
      <PageHeader
        title="Funil CRM (Unnichat)"
        subtitle="Pipeline de vendas etapa a etapa — onde os negócios estão parados e quanto vale cada fase"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          label="Pipeline aberto"
          value={brl(t.valor_aberto)}
          hint={`${num(t.abertos)} negócios`}
        />
        <KpiCard
          label="Ganhos"
          value={brl(t.valor_ganho)}
          hint={`${num(t.ganhos)} negócios`}
          tone="good"
        />
        <KpiCard
          label="Taxa de ganho"
          value={`${num(t.win_rate, 1)}%`}
          hint={`${num(t.ganhos)} ganhos / ${num(t.perdas)} perdas`}
          tone={t.win_rate >= 50 ? "good" : "warn"}
        />
        <KpiCard
          label="Perdas"
          value={brl(t.valor_perdido)}
          hint={`${num(t.perdas)} negócios`}
          tone="bad"
        />
      </div>

      <Card title="Negócios por etapa" className="mb-4">
        <div className="space-y-3">
          {crm.stages.map((s) => {
            const pct = (s.count / maxCount) * 100;
            return (
              <div key={s.etapa}>
                <div className="flex justify-between items-baseline text-sm mb-1">
                  <span className="text-slate-700 dark:text-zinc-300">{s.etapa}</span>
                  <span className="text-slate-900 dark:text-zinc-100 font-semibold">
                    {num(s.count)}
                    {s.valor > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-normal"> · {brl(s.valor)}</span>
                    )}
                    {s.dias_mediana !== null && s.dias_mediana >= 7 && (
                      <span className="text-rose-500 font-normal"> · {s.dias_mediana}d parado</span>
                    )}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 dark:bg-white/[0.07] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stageColor(s.etapa)}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400 dark:text-zinc-500">
          Foto do pipeline em {new Date(crm.as_of).toLocaleDateString("pt-BR")} ({num(t.deals)}{" "}
          negócios). Vermelho = parado (gargalo); verde = perto do fechamento. Os webhooks por
          etapa mantêm o histórico de transições vivo daqui pra frente.
        </p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title="Por atendente">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-white/10">
                <th className="py-2 font-medium">Atendente</th>
                <th className="py-2 font-medium text-right">Negócios</th>
                <th className="py-2 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {crm.by_atendente.map((a) => (
                <tr key={a.nome} className="border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                  <td className="py-1.5 text-slate-700 dark:text-zinc-300">{a.nome}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">{num(a.count)}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-900 dark:text-zinc-100 font-medium">
                    {brl(a.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Motivos de perda">
          {crm.motivos_perda.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-zinc-500">Sem perdas registradas.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {crm.motivos_perda.map((m) => (
                  <tr key={m.razao} className="border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                    <td className="py-1.5 text-slate-700 dark:text-zinc-300">{m.razao}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-900 dark:text-zinc-100 font-medium">
                      {num(m.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-slate-400 dark:text-zinc-500">
            Dica: hoje 100% das perdas estão como &quot;motivo não informado&quot;. Pedir o motivo
            ao fechar perdido vira inteligência de objeção.
          </p>
        </Card>
      </div>

      <Card title="Taxa de fechamento por vendedor (semanal)" className="mb-4">
        {closing.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-zinc-500">
            Começando a coletar agora. Cada movimento no Unnichat carimba o vendedor
            (via API) — os números de quem passou × quem fechou aparecem aqui conforme
            o time atende e fecha.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2 font-medium">Vendedor</th>
                  <th className="py-2 font-medium">Semana</th>
                  <th className="py-2 font-medium text-right">Passaram</th>
                  <th className="py-2 font-medium text-right">Fecharam</th>
                  <th className="py-2 font-medium text-right">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {closing.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                    <td className="py-1.5 text-slate-700 dark:text-zinc-300">{r.seller}</td>
                    <td className="py-1.5 text-slate-500 dark:text-zinc-400 tabular-nums">
                      {new Date(r.period + "T00:00:00").toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">{num(r.passaram)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">{num(r.fecharam)}</td>
                    <td
                      className={`py-1.5 text-right tabular-nums font-semibold ${
                        r.taxa !== null && r.taxa >= 20 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-zinc-300"
                      }`}
                    >
                      {r.taxa !== null ? `${num(r.taxa, 1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400 dark:text-zinc-500">
          &quot;Passaram&quot; = contatos distintos que o vendedor tocou na semana;
          &quot;Fecharam&quot; = os que viraram ganho. Coleta daqui pra frente.
        </p>
      </Card>

      {events.length > 0 && (
        <Card title="Movimentos recentes (ao vivo)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2 font-medium">Quando</th>
                  <th className="py-2 font-medium">Contato</th>
                  <th className="py-2 font-medium">Etapa</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                    <td className="py-1.5 text-slate-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">
                      {fmt(e.event_at)}
                    </td>
                    <td className="py-1.5 text-slate-700 dark:text-zinc-300">{e.name ?? "—"}</td>
                    <td className="py-1.5 text-slate-600 dark:text-zinc-400">{e.stage ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
