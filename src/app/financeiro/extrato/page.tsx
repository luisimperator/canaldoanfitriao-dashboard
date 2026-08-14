import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { isoToday, monthKey, sum } from "@/lib/metrics";
import { brl } from "@/lib/format";
import { DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ExtratoBanco } from "@/components/ExtratoBanco";

export const dynamic = "force-dynamic";

// Extrato do banco em página própria: o espelho da conta, sem os gráficos.
// O mesmo extrato continua embutido no /financeiro — aqui é para quem quer só
// conferir lançamento, sem passar por fluxo e despesas.

function shiftYM(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function lastDay(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ExtratoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tipo?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const data = await getDashboardData();
  const today = isoToday();
  const month = monthKey(today);
  const re = /^\d{4}-\d{2}(-\d{2})?$/;
  const rawTo = sp.to && re.test(sp.to) ? sp.to : month;
  // Padrão de 1 mês: quem abre o extrato quer o movimento recente, não meio ano.
  const rawFrom = sp.from && re.test(sp.from) ? sp.from : shiftYM(rawTo.slice(0, 7), 0);

  const periodStart = rawFrom.length > 7 ? rawFrom : `${rawFrom.slice(0, 7)}-01`;
  const periodEndRaw = rawTo.length > 7 ? rawTo : lastDay(rawTo.slice(0, 7));
  const periodEnd = periodEndRaw > today ? today : periodEndRaw;

  const all = data.finTransactions;
  const saldoAtual = sum(all.map((t) => (t.direction === "in" ? t.amount : -t.amount)));
  const monthTx = all.filter((t) => monthKey(t.transactionDate) === month);
  const inMonth = sum(monthTx.filter((t) => t.direction === "in").map((t) => t.amount));
  const outMonth = sum(monthTx.filter((t) => t.direction === "out").map((t) => t.amount));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Extrato do banco"
          subtitle="Espelho da conta PJ do Canal do Anfitrião no Banco Inter"
        />
        <Link
          href="/financeiro"
          className="shrink-0 rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-sm text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
        >
          ← Financeiro
        </Link>
      </div>
      <DemoBanner show={data.isDemo} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500 dark:text-zinc-400">Período</span>
        <DateRangePicker />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard label="Saldo atual" value={brl(saldoAtual)} tone={saldoAtual >= 0 ? "good" : "bad"} />
        <KpiCard label="Entradas no mês" value={brl(inMonth)} tone="good" />
        <KpiCard label="Saídas no mês" value={brl(outMonth)} tone="bad" />
        <KpiCard
          label="Resultado do mês"
          value={brl(inMonth - outMonth)}
          tone={inMonth - outMonth >= 0 ? "good" : "bad"}
        />
      </div>

      <ExtratoBanco
        transactions={all}
        finCategories={data.finCategories}
        periodStart={periodStart}
        periodEnd={periodEnd}
        sp={sp}
        basePath="/financeiro/extrato"
      />

      <p className="mt-4 text-xs text-slate-400 dark:text-zinc-500">
        Espelho da conta PJ do Banco Inter via sync automático (a cada ~30 min) — pode haver
        pequena defasagem em relação ao app do banco. “Saldo do dia” = saldo acumulado no fim
        daquele dia considerando todo o histórico importado.
      </p>
    </div>
  );
}
