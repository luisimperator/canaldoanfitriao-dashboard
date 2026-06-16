import { getDashboardData } from "@/lib/data";
import { bottleneckAnalysis, type BottleneckStatus } from "@/lib/metrics";
import { Card, DemoBanner, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const statusStyle: Record<
  BottleneckStatus,
  { badge: string; border: string; label: string }
> = {
  critico: {
    badge: "bg-rose-100 text-rose-700",
    border: "border-rose-300",
    label: "Gargalo",
  },
  atencao: {
    badge: "bg-amber-100 text-amber-700",
    border: "border-amber-300",
    label: "Atenção",
  },
  ok: {
    badge: "bg-emerald-100 text-emerald-700",
    border: "border-slate-200",
    label: "Saudável",
  },
};

export default async function GargaloPage() {
  const data = await getDashboardData();
  const { primary, signals, hasData } = bottleneckAnalysis(data);

  return (
    <div>
      <PageHeader
        title="Qual é o gargalo?"
        subtitle="Diagnóstico automático do que mais trava o crescimento — robusto a lançamento (mediana de meses fechados e ritmo diário, não somas cruas)"
      />
      <DemoBanner show={data.isDemo} />

      {!hasData ? (
        <Card>
          <p className="text-sm text-slate-600">
            Ainda não há leads e vendas suficientes para diagnosticar o gargalo.
            Conecte as integrações para começar a coletar dados.
          </p>
        </Card>
      ) : primary ? (
        <section
          className={`mb-6 rounded-xl border-2 p-5 sm:p-6 ${
            primary.status === "critico"
              ? "border-rose-300 bg-rose-50"
              : "border-amber-300 bg-amber-50"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            O gargalo agora é
          </div>
          <h2 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900">
            {primary.headline}
          </h2>
          <p className="mt-2 text-sm text-slate-700">{primary.detail}</p>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            → {primary.action}
          </p>
        </section>
      ) : (
        <section className="mb-6 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 sm:p-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Nenhum gargalo crítico agora
          </h2>
          <p className="mt-2 text-sm text-slate-700">
            Leads, conversão, time e mídia estão equilibrados. Bom momento para
            acelerar a captação e forçar o próximo nível.
          </p>
        </section>
      )}

      {hasData && (
        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          {signals.map((s) => {
            const style = statusStyle[s.status];
            return (
              <Card key={s.kind} className={`border ${style.border}`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {s.label}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style.badge}`}
                  >
                    {style.label}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">{s.headline}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{s.detail}</p>
                <p className="mt-2 text-xs text-slate-500">{s.action}</p>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Como funciona: cada fator recebe uma pontuação de 0 a 100 conforme o
        quanto está freando o crescimento; o maior vira o gargalo. Para não ser
        enganado por lançamento, usa MEDIANA (ritmo diário de leads e meses
        fechados) em vez de somas cruas de 30 dias. Critérios: queda na entrada
        de leads, queda na conversão, leads excedendo a capacidade do time e alta
        no custo de anúncio por venda.
      </p>
    </div>
  );
}
