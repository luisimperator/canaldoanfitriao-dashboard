import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { daysAgo, isoToday, sum } from "@/lib/metrics";
import { brl } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { DateRangePicker } from "@/components/DateRangePicker";
import type { FinTransaction } from "@/lib/types";

export const dynamic = "force-dynamic";

// Espelho do banco (Inter) no painel: saldo, extrato com saldo do dia, filtro
// de entradas/saídas, busca e a soma do período — pra não precisar abrir o app
// do banco. Os lançamentos entram pelo sync do Inter (cron a cada 30 min).

const MAX_ROWS = 400;

const fmtDia = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    timeZone: "UTC",
  });

export default async function ExtratoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tipo?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const data = await getDashboardData();
  const today = isoToday();

  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.from && re.test(sp.from) ? sp.from : daysAgo(29, new Date(today));
  const to = sp.to && re.test(sp.to) ? sp.to : today;
  const tipo = sp.tipo === "entradas" || sp.tipo === "saidas" ? sp.tipo : "tudo";
  const q = (sp.q ?? "").trim().toLowerCase();

  const all = data.finTransactions;

  // Saldo atual e saldo acumulado por dia (histórico inteiro, pra mostrar o
  // "saldo no fim do dia" igual extrato de banco).
  const saldoAtual = sum(all.map((t) => (t.direction === "in" ? t.amount : -t.amount)));
  const netByDay = new Map<string, number>();
  for (const t of all) {
    const d = t.transactionDate.slice(0, 10);
    netByDay.set(d, (netByDay.get(d) ?? 0) + (t.direction === "in" ? t.amount : -t.amount));
  }
  const saldoFimDoDia = new Map<string, number>();
  let acc = 0;
  for (const d of [...netByDay.keys()].sort()) {
    acc += netByDay.get(d)!;
    saldoFimDoDia.set(d, acc);
  }

  // Extrato do período (tipo + busca aplicados só à listagem/somas do período).
  const matches = (t: FinTransaction) =>
    !q ||
    t.description.toLowerCase().includes(q) ||
    (t.counterparty ?? "").toLowerCase().includes(q);

  const periodo = all.filter(
    (t) => t.transactionDate >= from && t.transactionDate <= to && matches(t)
  );
  const entradas = sum(periodo.filter((t) => t.direction === "in").map((t) => t.amount));
  const saidas = sum(periodo.filter((t) => t.direction === "out").map((t) => t.amount));

  const listadas = periodo
    .filter((t) => tipo === "tudo" || (tipo === "entradas" ? t.direction === "in" : t.direction === "out"))
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  const truncado = listadas.length > MAX_ROWS;
  const visiveis = listadas.slice(0, MAX_ROWS);

  // Agrupa por dia (desc), preservando a ordem.
  const dias: { dia: string; txs: FinTransaction[] }[] = [];
  for (const t of visiveis) {
    const d = t.transactionDate.slice(0, 10);
    if (dias.length === 0 || dias[dias.length - 1].dia !== d) dias.push({ dia: d, txs: [] });
    dias[dias.length - 1].txs.push(t);
  }

  const catName = new Map(data.finCategories.map((c) => [c.id, c.name]));
  const chip = (ativo: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${
      ativo ? "bg-rose-600 text-white font-semibold" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;
  const qs = (t: string) => {
    const p = new URLSearchParams();
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (t !== "tudo") p.set("tipo", t);
    if (sp.q) p.set("q", sp.q);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Extrato — Banco Inter"
          subtitle="Espelho da conta PJ: saldo, lançamentos e somas do período"
        />
        <DateRangePicker placeholder="Últimos 30 dias" />
      </div>
      <DemoBanner show={data.isDemo} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <KpiCard label="Saldo atual" value={brl(saldoAtual)} tone={saldoAtual >= 0 ? "good" : "bad"} />
        <KpiCard label="Entradas no período" value={brl(entradas)} tone="good" />
        <KpiCard label="Saídas no período" value={brl(saidas)} tone="bad" />
        <KpiCard
          label="Resultado do período"
          value={brl(entradas - saidas)}
          tone={entradas - saidas >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/financeiro/extrato${qs("tudo")}`} className={chip(tipo === "tudo")}>
          Tudo
        </Link>
        <Link href={`/financeiro/extrato${qs("entradas")}`} className={chip(tipo === "entradas")}>
          Só entradas
        </Link>
        <Link href={`/financeiro/extrato${qs("saidas")}`} className={chip(tipo === "saidas")}>
          Só saídas
        </Link>
        <form method="get" className="flex items-center gap-1.5 ml-auto">
          {sp.from && <input type="hidden" name="from" value={sp.from} />}
          {sp.to && <input type="hidden" name="to" value={sp.to} />}
          {tipo !== "tudo" && <input type="hidden" name="tipo" value={tipo} />}
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Buscar (ex.: eduzz, aluguel, pix...)"
            className="w-48 sm:w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">
            Buscar
          </button>
        </form>
      </div>

      <Card title={`Extrato · ${fmtDia(from)} → ${fmtDia(to)}`}>
        {dias.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum lançamento no período{q ? ` para “${sp.q}”` : ""}.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {dias.map(({ dia, txs }) => (
              <div key={dia} className="py-2">
                <div className="flex items-baseline justify-between mb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {fmtDia(dia)}
                  </p>
                  <p className="text-[11px] tabular-nums text-slate-400">
                    saldo do dia: {brl(saldoFimDoDia.get(dia) ?? 0)}
                  </p>
                </div>
                <ul className="space-y-1">
                  {txs.map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-slate-700">
                          {t.description || "(sem descrição)"}
                        </span>
                        {(t.counterparty || t.categoryId) && (
                          <span className="block truncate text-[11px] text-slate-400">
                            {[t.counterparty, t.categoryId ? catName.get(t.categoryId) : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 tabular-nums text-sm font-semibold ${
                          t.direction === "in" ? "text-emerald-600" : "text-slate-900"
                        }`}
                      >
                        {t.direction === "in" ? "+" : "−"}
                        {brl(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 border-t border-slate-200 pt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-slate-600">
            Soma do período{q ? ` (filtro “${sp.q}”)` : ""}:
          </span>
          <span className="font-semibold text-emerald-600 tabular-nums">+{brl(entradas)}</span>
          <span className="font-semibold text-slate-900 tabular-nums">−{brl(saidas)}</span>
          <span
            className={`font-semibold tabular-nums ${
              entradas - saidas >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            = {brl(entradas - saidas)}
          </span>
          <span className="text-slate-400">
            {listadas.length} lançamento{listadas.length === 1 ? "" : "s"}
            {truncado ? ` (mostrando os ${MAX_ROWS} mais recentes)` : ""}
          </span>
        </div>
      </Card>

      <p className="mt-4 text-xs text-slate-400">
        Espelho da conta PJ do Banco Inter via sync automático (a cada ~30 min) — pode haver
        pequena defasagem em relação ao app do banco. “Saldo do dia” = saldo acumulado no fim
        daquele dia considerando todo o histórico importado.
      </p>
    </div>
  );
}
