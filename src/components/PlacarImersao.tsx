import { num, shortDate } from "@/lib/format";

// Placar da Imersão no formato do card que o Foley manda no grupo do
// WhatsApp: o dia e o acumulado da turma, com gasto no Meta (campanhas CDR),
// ingressos, vendido líquido e CPA. Os números vêm de imersao_placar() no
// Supabase (migração 0126).

export interface PlacarDia {
  dia: string;
  ingressos: number;
  bruto: number;
  liquido: number;
  /** com os 12,15% de impostos da Meta */
  gasto: number;
  gasto_sem_imposto?: number;
  cliques: number;
  checkouts: number;
  compras_meta: number;
}

export interface Placar {
  turma: string;
  dias: PlacarDia[];
  melhor_criativo: { nome: string; vendas: number } | null;
  meta_atualizado_em: string | null;
}

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const hora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );

function soma(dias: PlacarDia[]): PlacarDia {
  return dias.reduce(
    (a, d) => ({
      dia: a.dia,
      ingressos: a.ingressos + d.ingressos,
      bruto: a.bruto + Number(d.bruto),
      liquido: a.liquido + Number(d.liquido),
      gasto: a.gasto + Number(d.gasto),
      cliques: a.cliques + d.cliques,
      checkouts: a.checkouts + d.checkouts,
      compras_meta: a.compras_meta + d.compras_meta,
    }),
    { dia: "", ingressos: 0, bruto: 0, liquido: 0, gasto: 0, cliques: 0, checkouts: 0, compras_meta: 0 }
  );
}

const ativo = (d: PlacarDia) => d.ingressos > 0 || Number(d.gasto) > 0;

function Bloco({ titulo, d }: { titulo: string; d: PlacarDia }) {
  const gasto = Number(d.gasto);
  const liquido = Number(d.liquido);
  const cpaBruto = d.ingressos > 0 ? gasto / d.ingressos : null;
  const cpaLiquido = d.ingressos > 0 ? (gasto - liquido) / d.ingressos : null;
  const linhas: { rotulo: string; valor: string; tom?: string }[] = [
    { rotulo: "Gasto no Meta", valor: reais(gasto) },
    { rotulo: "Ingressos vendidos", valor: num(d.ingressos) },
    { rotulo: "Vendido líquido", valor: reais(liquido) },
    { rotulo: "CPA bruto", valor: cpaBruto == null ? "—" : reais(cpaBruto) },
    {
      rotulo: "CPA líquido",
      valor: cpaLiquido == null ? "—" : `${reais(cpaLiquido)}${cpaLiquido <= 0 ? " ✓" : ""}`,
      tom:
        cpaLiquido == null
          ? undefined
          : cpaLiquido <= 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-amber-600 dark:text-amber-400",
    },
  ];
  return (
    <div className="rounded-[18px] border border-line p-4">
      <div className="mb-2 text-[13px] font-semibold text-ink">{titulo}</div>
      <dl className="space-y-1.5">
        {linhas.map((l) => (
          <div key={l.rotulo} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-ink-2">{l.rotulo}</dt>
            <dd className={`font-semibold tabular-nums ${l.tom ?? "text-ink"}`}>{l.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PlacarImersao({ placar, hoje }: { placar: Placar; hoje: string }) {
  const dias = placar.dias;
  const ontem = (() => {
    const [y, m, d] = hoje.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  })();
  const diaHoje = dias.find((d) => d.dia === hoje);
  const diaOntem = dias.find((d) => d.dia === ontem);
  const comMovimento = dias.filter(ativo);
  const total = soma(dias);
  const desde = comMovimento[0]?.dia;

  return (
    <section className="mb-4 rounded-[22px] border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.08)] sm:p-6 dark:shadow-none">
      <h2 className="mb-4 text-[15px] font-semibold tracking-[-0.01em] text-ink">
        Placar · turma {shortDate(placar.turma)}
      </h2>

      {comMovimento.length === 0 ? (
        <p className="text-sm text-ink-2">Sem venda nem gasto nas campanhas da Imersão pra essa turma ainda.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {diaHoje && <Bloco titulo={`Hoje, até agora (${shortDate(hoje)})`} d={diaHoje} />}
            {diaOntem && <Bloco titulo={`Ontem (${shortDate(ontem)})`} d={diaOntem} />}
            <Bloco titulo={`Acumulado da turma${desde ? ` (desde ${shortDate(desde)})` : ""}`} d={total} />
          </div>

          <div className="mt-4 space-y-1 text-sm text-ink">
            {placar.melhor_criativo && (
              <p>
                <span className="text-ink-2">Melhor criativo:</span> {placar.melhor_criativo.nome}{" "}
                <span className="text-ink-2">({num(placar.melhor_criativo.vendas)} vendas)</span>
              </p>
            )}
            <p>
              <span className="text-ink-2">No Meta, na turma:</span> {num(total.cliques)} cliques no link ·{" "}
              {num(total.checkouts)} checkouts iniciados · {num(total.compras_meta)} compras vistas pelo Meta
            </p>
          </div>

          {comMovimento.length > 1 && (
            <div className="-mx-2 mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
                    <th className="px-2 py-1.5">Dia</th>
                    <th className="px-2 py-1.5 text-right">Gasto</th>
                    <th className="px-2 py-1.5 text-right">Ingressos</th>
                    <th className="px-2 py-1.5 text-right">Líquido</th>
                    <th className="px-2 py-1.5 text-right">CPA líq.</th>
                  </tr>
                </thead>
                <tbody>
                  {comMovimento.map((d) => {
                    const cpa = d.ingressos > 0 ? (Number(d.gasto) - Number(d.liquido)) / d.ingressos : null;
                    return (
                      <tr key={d.dia} className="border-b border-line tabular-nums">
                        <td className="px-2 py-1.5 text-ink">{shortDate(d.dia)}</td>
                        <td className="px-2 py-1.5 text-right text-ink">{reais(Number(d.gasto))}</td>
                        <td className="px-2 py-1.5 text-right text-ink">{num(d.ingressos)}</td>
                        <td className="px-2 py-1.5 text-right text-ink">{reais(Number(d.liquido))}</td>
                        <td
                          className={`px-2 py-1.5 text-right ${
                            cpa == null ? "text-ink-2" : cpa <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-ink"
                          }`}
                        >
                          {cpa == null ? "—" : reais(cpa)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-[11px] text-ink-2">
            Gasto das campanhas do Meta que começam com CDR, com os 12,15% de impostos que a Meta cobra à parte (o
            Gerenciador de Anúncios mostra sem).
            Vendido líquido é o que a Eduzz repassa. CPA líquido negativo: o ingresso pagou o anúncio.
            {placar.meta_atualizado_em ? ` Meta atualizado às ${hora(placar.meta_atualizado_em)}.` : ""}
          </p>
        </>
      )}
    </section>
  );
}
