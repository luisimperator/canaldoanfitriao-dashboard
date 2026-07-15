import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { getProvisaoCaixa, somaAte, METODO_LABEL } from "@/lib/provisao-caixa";
import { brl, shortDate } from "@/lib/format";
import { Card, DemoBanner, PageHeader } from "@/components/ui";
import { ProvisaoTimeline } from "@/components/ProvisaoTimeline";
import { ProvisaoRows } from "@/components/ProvisaoRows";
import { SaldoEduzzForm } from "@/components/SaldoEduzzForm";

export const dynamic = "force-dynamic";

// Provisão de caixa: quanto já caiu (Inter + saldo Eduzz) e quando o resto
// libera na Eduzz — pago com creditDate exato + a vencer por previsão — com
// as saídas previstas do mês. Modelo de dados em @/lib/provisao-caixa.

function addDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fimDoMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export default async function ProvisaoPage() {
  const data = await getDashboardData();
  const p = await getProvisaoCaixa();

  if (!p) {
    return (
      <div>
        <PageHeader title="Provisão de caixa" subtitle="Quanto já caiu e quando o resto libera na Eduzz" />
        <DemoBanner show={data.isDemo} />
        <Card title="Sem dados">
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            A provisão precisa do Supabase configurado, das vendas da Eduzz e do extrato do Inter.
          </p>
        </Card>
      </div>
    );
  }

  const saldoEduzz =
    p.saldoEduzzAncora != null ? p.saldoEduzzAncora.valor + p.liberadoDesdeAncora : null;
  const disponivel = p.saldoInter + (saldoEduzz ?? 0);

  const corte30 = addDias(p.hoje, 30);
  const corteMes = fimDoMes(p.hoje);
  const mesNome = new Date(`${p.hoje}T12:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    timeZone: "UTC",
  });
  const mesCap = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);

  const d30 = {
    pago: somaAte(p.pagoPorDia, corte30),
    prev: somaAte(p.aVencerPorDia, corte30),
  };
  const mes = {
    pago: somaAte(p.pagoPorDia, corteMes),
    prev: somaAte(p.aVencerPorDia, corteMes),
  };

  // saídas previstas até o fim do mês: recorrentes que ainda não venceram,
  // com piso na média pro-rata (a média cobre o que não é recorrente).
  const diaHoje = Number(p.hoje.slice(8, 10));
  const diasNoMes = Number(corteMes.slice(8, 10));
  const recorrentesRestantes = p.saidasRecorrentes
    .filter((s) => s.dia >= diaHoje)
    .reduce((a, s) => a + s.valor, 0);
  const mediaProRata = (p.mediaSaidasMes * (diasNoMes - diaHoje)) / diasNoMes;
  const saidasPrevistas = Math.round(Math.max(recorrentesRestantes, mediaProRata));
  const saldoFimMes = Math.round(disponivel + mes.pago + mes.prev - saidasPrevistas);

  const lagLabel = Object.entries(p.lags)
    .map(([m, d]) => `${(METODO_LABEL[m] ?? m).toLowerCase()} ~${Math.round(d)}d`)
    .join(" · ");

  const atualizado = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Provisão de caixa"
          subtitle="Quanto já caiu (Inter + Eduzz) e quando o resto libera na Eduzz"
        />
        <Link
          href="/financeiro"
          className="shrink-0 rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
        >
          ← Financeiro
        </Link>
      </div>
      <DemoBanner show={data.isDemo} />

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-2">
        <div className="bg-white dark:bg-[#15121f] rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-4">
          <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
            Disponível agora
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums mt-1 text-slate-900 dark:text-zinc-100">
            {brl(disponivel)}
          </div>
          <div className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
            Inter {brl(p.saldoInter)}
            {saldoEduzz != null ? (
              <>
                {" "}
                · Eduzz {brl(saldoEduzz)}
                {p.liberadoDesdeAncora > 0 && p.saldoEduzzAncora && (
                  <> ({brl(p.saldoEduzzAncora.valor)} em {shortDate(p.saldoEduzzAncora.informadoEm.slice(0, 10))} + {brl(p.liberadoDesdeAncora)} liberados)</>
                )}
              </>
            ) : (
              <> · Eduzz não informado</>
            )}
          </div>
          <div className="mt-1.5">
            <SaldoEduzzForm atual={p.saldoEduzzAncora?.valor ?? null} />
          </div>
        </div>

        <div className="bg-white dark:bg-[#15121f] rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-4">
          <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
            A liberar (Eduzz)
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums mt-1 text-amber-600 dark:text-amber-400">
            {brl(p.aLiberarTotal)}
          </div>
          <div className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
            {p.aLiberarCobrancas} cobranças pagas, ainda não creditadas
          </div>
        </div>

        <div className="rounded-xl border border-violet-300 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/[0.06] shadow-sm p-4">
          <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
            Entra em 30 dias
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums mt-1 text-slate-900 dark:text-zinc-100">
            {brl(d30.pago + d30.prev)}
          </div>
          <div className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
            <span className="text-emerald-600 dark:text-emerald-400">{brl(d30.pago)}</span> já pago ·{" "}
            <span className="text-amber-600 dark:text-amber-400">{brl(d30.prev)}</span> a vencer (previsão)
          </div>
        </div>

        <div className="rounded-xl border border-violet-300 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/[0.06] shadow-sm p-4">
          <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
            Entra até o fim de {mesCap}
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums mt-1 text-slate-900 dark:text-zinc-100">
            {brl(mes.pago + mes.prev)}
          </div>
          <div className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
            <span className="text-emerald-600 dark:text-emerald-400">{brl(mes.pago)}</span> já pago ·{" "}
            <span className="text-amber-600 dark:text-amber-400">{brl(mes.prev)}</span> a vencer (previsão)
          </div>
        </div>
      </div>

      <p className="mb-4 text-xs text-slate-400 dark:text-zinc-500">
        Valores líquidos (taxa da Eduzz já descontada).
      </p>

      <Card title="Linha do tempo de liberação" className="mb-4">
        <ProvisaoTimeline
          pago={p.pagoPorDia}
          vencer={p.aVencerPorDia}
          disponivel={disponivel}
          hoje={p.hoje}
        />
      </Card>

      <Card title={`Liberações confirmadas — pago (${brl(p.aLiberarTotal)})`} className="mb-4">
        {p.pagoPorDia.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Nada pago aguardando liberação no momento — todo o dinheiro recebido já está disponível.
          </p>
        ) : (
          <ProvisaoRows dias={p.pagoPorDia} hoje={p.hoje} tone="emerald" />
        )}
      </Card>

      {p.aVencerPorDia.length > 0 && (
        <Card title={`A vencer — previsão (${brl(p.aVencerTotal)})`} className="mb-4">
          <p className="mb-3 text-xs text-slate-400 dark:text-zinc-500">
            Cobranças ainda não pagas ({p.aVencerCobrancas}), assumindo pagamento no vencimento.
            O prazo de liberação usa a mediana real por meio de pagamento ({lagLabel}).
          </p>
          <ProvisaoRows dias={p.aVencerPorDia} hoje={p.hoje} tone="amber" />
        </Card>
      )}

      <Card title="Saídas previstas" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3 mb-4">
          <div>
            <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
              Média de saídas/mês
            </div>
            <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-zinc-100">
              {brl(p.mediaSaidasMes)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
              Previsto até o fim de {mesCap}
            </div>
            <div className="text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {brl(saidasPrevistas)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
              Saldo projetado fim de {mesCap}
            </div>
            <div
              className={`text-lg font-bold tabular-nums ${saldoFimMes >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
            >
              {brl(saldoFimMes)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-zinc-500">
              disponível + entra no mês − saídas previstas
            </div>
          </div>
        </div>

        {p.saidasRecorrentes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 dark:text-zinc-500">
                  <th className="py-1.5 font-medium">Saída recorrente</th>
                  <th className="py-1.5 font-medium text-right">Dia típico</th>
                  <th className="py-1.5 font-medium text-right">Valor típico</th>
                </tr>
              </thead>
              <tbody>
                {p.saidasRecorrentes.map((s) => (
                  <tr key={s.quem} className="border-t border-slate-100 dark:border-white/[0.06]">
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-zinc-300">
                      <span className="line-clamp-1">{s.quem}</span>
                      <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                        apareceu em {s.meses} dos últimos 4 meses
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500 dark:text-zinc-400">
                      dia {s.dia}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-semibold text-slate-900 dark:text-zinc-100">
                      {brl(s.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-400 dark:text-zinc-500">
        Liberações pagas usam o creditDate exato da Eduzz. Datas com ~ são previsão: pagamento
        no vencimento + prazo mediano do método ({lagLabel}, medidos nos últimos 120 dias).
        O saldo Eduzz é informado manualmente e corrigido com o que liberou desde então.
        Saídas recorrentes: apareceram em ≥3 dos últimos 4 meses no extrato do Inter.
        Atualizado {atualizado}.
      </p>
    </div>
  );
}
