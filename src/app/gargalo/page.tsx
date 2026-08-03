import { getDashboardData } from "@/lib/data";
import { restricaoAnalysis, type RestricaoStatus } from "@/lib/metrics";
import { getD0ByLoad, getSpeedToLead } from "@/lib/speed";
import { brl } from "@/lib/format";
import { Card, DemoBanner, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

// Restrição no sentido de Goldratt: o elo que limita o throughput — e o
// throughput que interessa aqui é lucro líquido. "Piorou" não é restrição
// (isso é sintoma, fica nos alertas de tendência); restrição é falta de
// capacidade em algum elo, e existe UMA por vez.

const candidataStyle: Record<RestricaoStatus, { badge: string; border: string; label: string }> = {
  critico: {
    badge: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300",
    border: "border-rose-300 dark:border-rose-500/40",
    label: "Restrição",
  },
  atencao: {
    badge: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-500/40",
    label: "Atenção",
  },
  ok: {
    badge: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    border: "border-slate-200 dark:border-white/10",
    label: "Folgado",
  },
};

const alertaStyle: Record<RestricaoStatus, { badge: string; label: string }> = {
  critico: {
    badge: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300",
    label: "Piorando",
  },
  atencao: {
    badge: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
    label: "Atenção",
  },
  ok: {
    badge: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    label: "Estável",
  },
};

export default async function GargaloPage() {
  const data = await getDashboardData();
  const [speed, d0Load] = await Promise.all([getSpeedToLead(), getD0ByLoad()]);
  const { restricao, candidatas, alertas, ticketCurso, hasData } = restricaoAnalysis(
    data,
    undefined,
    speed.total,
    d0Load
  );

  return (
    <div>
      <PageHeader
        title="Qual é a restrição?"
        subtitle="Teoria das Restrições: o throughput que importa é lucro líquido, e a restrição é o elo que o limita — uma por vez. Queda de conversão ou CAC subindo são sintomas, não restrição; eles ficam nos alertas de tendência."
      />
      <DemoBanner show={data.isDemo} />

      {!hasData ? (
        <Card>
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Ainda não há leads e vendas suficientes para diagnosticar a restrição.
            Conecte as integrações para começar a coletar dados.
          </p>
        </Card>
      ) : restricao ? (
        <section
          className={`mb-6 rounded-xl border-2 p-5 sm:p-6 ${
            restricao.status === "critico"
              ? "border-rose-300 bg-rose-50 dark:bg-rose-500/10"
              : "border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            A restrição agora é
          </div>
          <h2 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 dark:text-zinc-100">
            {restricao.headline}
          </h2>
          <p className="mt-2 text-sm text-slate-700 dark:text-zinc-300">{restricao.detail}</p>
          {restricao.ganhoMensal !== null && restricao.ganhoMensal > 0 && (
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-zinc-100">
              Elevar essa restrição vale ≈{" "}
              <span className="text-lg">{brl(restricao.ganhoMensal)}/mês</span> em venda de
              curso{" "}
              <span className="font-normal text-slate-500 dark:text-zinc-400">
                (ordem de grandeza, no ticket mediano de{" "}
                {ticketCurso !== null ? brl(ticketCurso) : "—"})
              </span>
            </p>
          )}
          <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-zinc-100">
            → {restricao.acao}
          </p>
        </section>
      ) : (
        <section className="mb-6 rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 p-5 sm:p-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-zinc-100">
            Nenhuma restrição interna evidente
          </h2>
          <p className="mt-2 text-sm text-slate-700 dark:text-zinc-300">
            Time, processo e volume de leads estão equilibrados. Pela ToC sempre existe uma
            restrição em algum lugar — quando os elos internos folgam, ela está no mercado:
            é hora de elevar captação e oferta até um elo interno voltar a apertar.
          </p>
        </section>
      )}

      {hasData && (
        <>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            Candidatas a restrição
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            {candidatas.map((c) => {
              const s = candidataStyle[c.status];
              return (
                <Card key={c.kind} className={`border ${s.border}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wide">
                      {c.label}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.badge}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    {c.headline}
                  </h4>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-zinc-400">{c.detail}</p>
                  {c.ganhoMensal !== null && c.ganhoMensal > 0 && (
                    <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Elevar vale ≈ {brl(c.ganhoMensal)}/mês
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">{c.acao}</p>
                </Card>
              );
            })}
          </div>

          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            Alertas de tendência — sintoma, não restrição
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {alertas.map((a) => {
              const s = alertaStyle[a.status];
              return (
                <Card key={a.kind}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wide">
                      {a.label}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.badge}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    {a.headline}
                  </h4>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-zinc-400">{a.detail}</p>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-slate-400 dark:text-zinc-500">
        Os cinco passos de focalização (Goldratt): 1. identificar a restrição · 2. explorar ao
        máximo o que ela já tem · 3. subordinar o resto a ela · 4. elevar a restrição ·
        5. voltar ao passo 1, porque ela muda de lugar. Como os números saem: capacidade usa
        leads qualificados (quentes + muito quentes) contra vendas de CURSO (A5E + Gigantes;
        ingressos e avulsos fora); o ganho de elevar usa o ticket mediano de curso e o estudo
        de atendimento (lead conversado converte ~10%, nunca conversado ~3%); tendências usam
        mediana de meses fechados e mediana diária, imunes a pico de lançamento. Ganhos são
        ordem de grandeza pra ordenar decisão, não promessa.
      </p>
    </div>
  );
}
