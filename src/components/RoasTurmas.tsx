import { num, shortDate } from "@/lib/format";

// ROAS por turma do lançamento pago semanal, no formato do card "ROAS total"
// que o Foley manda no grupo (Fernando, 25/11). Os números vêm de
// imersao_roas_turmas() no Supabase (migração 0153): ingressos + vendas do
// pós-Imersão (sábado a segunda), menos taxas da Eduzz e imposto, contra o
// gasto das campanhas CDR no Meta e os modelos de WhatsApp da turma.

export interface RoasTurma {
  turma: string;
  fechada: boolean;
  ingressos: number;
  ingressos_bruto: number;
  pos: { produto: string; n: number; bruto: number }[];
  pos_bruto: number;
  bruto: number;
  taxas_eduzz: number;
  aliquota: number;
  imposto: number;
  receita_liquida: number;
  meta: number;
  whatsapp: number;
  custo: number;
  lucro: number;
  roas: number | null;
}

const reais = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function domingo(turma: string): string {
  const [y, m, d] = turma.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function produtoCurto(p: string): string {
  if (/anfitri[aã]o 5 estrelas/i.test(p)) return "A5E";
  if (/black friday/i.test(p)) return "Black";
  if (/gigantes/i.test(p)) return "Gigantes";
  if (/max/i.test(p)) return "Max";
  return p;
}

function Linha({ icone, rotulo, valor, forte, tom }: { icone: string; rotulo: string; valor: string; forte?: boolean; tom?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className={`min-w-0 ${forte ? "font-semibold text-ink" : "text-ink-2"}`}>
        <span aria-hidden className="mr-1.5">
          {icone}
        </span>
        {rotulo}
      </dt>
      <dd className={`shrink-0 tabular-nums ${forte ? "font-semibold" : ""} ${tom ?? "text-ink"}`}>{valor}</dd>
    </div>
  );
}

function CardTurma({ r }: { r: RoasTurma }) {
  const lucroTom = r.lucro >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  const pos = r.pos.map((p) => `${num(p.n)} ${produtoCurto(p.produto)}`).join(", ");
  const aliquota = num(Number(r.aliquota) * 100, 1);
  return (
    <div className="min-w-0 rounded-[18px] border border-line p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13px] font-semibold text-ink">
          🏁 ROAS total · Turma {shortDate(r.turma)} e {shortDate(domingo(r.turma))}
        </div>
        {!r.fechada && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            em andamento
          </span>
        )}
      </div>
      <dl className="space-y-1.5">
        <Linha icone="🧾" rotulo="Faturamento bruto" valor={reais(r.bruto)} />
        <p className="-mt-0.5 pl-6 text-[11px] text-ink-2">
          {num(r.ingressos)} ingressos ({reais(r.ingressos_bruto)})
          {r.pos_bruto > 0 ? ` + pós-Imersão ${reais(r.pos_bruto)} (${pos})` : r.fechada ? " · sem venda no pós-Imersão" : ""}
        </p>
        <Linha icone="🏦" rotulo="Taxas da Eduzz" valor={reais(r.taxas_eduzz)} />
        <Linha icone="🏛️" rotulo={`Imposto (${aliquota}%)`} valor={reais(r.imposto)} />
        <Linha icone="💰" rotulo="Receita líquida" valor={reais(r.receita_liquida)} forte />
      </dl>
      <dl className="mt-3 space-y-1.5 border-t border-line pt-3">
        <Linha icone="💸" rotulo="Meta Ads" valor={reais(r.meta)} />
        <Linha icone="💬" rotulo="WhatsApp API" valor={reais(r.whatsapp)} />
        <Linha icone="🎯" rotulo="Custo de aquisição" valor={reais(r.custo)} forte />
      </dl>
      <dl className="mt-3 space-y-1.5 border-t border-line pt-3">
        <Linha icone="📈" rotulo="Lucro líquido da turma" valor={reais(r.lucro)} forte tom={lucroTom} />
        <Linha
          icone="🚀"
          rotulo="ROAS"
          valor={r.roas == null ? "—" : `${num(Number(r.roas), 1)}x`}
          forte
          tom={r.roas == null ? undefined : r.roas >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
        />
      </dl>
      {!r.fechada && (
        <p className="mt-3 text-[11px] text-ink-2">
          Ainda vendendo: o pós-Imersão entra de sábado a segunda, e o ROAS sobe com ele.
        </p>
      )}
    </div>
  );
}

export function RoasTurmas({ turmas }: { turmas: RoasTurma[] }) {
  if (turmas.length === 0) return null;
  return (
    <section className="mb-4 rounded-[22px] border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.08)] sm:p-6 dark:shadow-none">
      <h2 className="mb-4 text-[15px] font-semibold tracking-[-0.01em] text-ink">ROAS por turma</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {turmas.map((r) => (
          <CardTurma key={r.turma} r={r} />
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-2">
        Bruto = ingressos da turma + vendas pagas de sábado a segunda de quem comprou o ingresso (ou pelo link da oferta
        da Imersão). Taxas da Eduzz pela fatura; imposto pela alíquota do Simples da política de caixa. Meta = campanhas
        CDR da semana da turma, com os 12,15% de impostos. WhatsApp = modelos da Imersão da semana e da oferta pós-Imersão,
        pelo custo real da Meta. ROAS = receita líquida ÷ custo de aquisição.
      </p>
    </section>
  );
}
