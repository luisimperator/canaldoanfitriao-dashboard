import { getDashboardData } from "@/lib/data";
import { isoToday, paidSales } from "@/lib/metrics";
import { brl, num } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { GoalPaceChart } from "@/components/charts";

export const dynamic = "force-dynamic";

// 4º Encontro de Anfitriões — corrida de ingressos até o evento.
// Meta e data são do evento atual; depois de 18/07/2026 a página vira histórico.
const META = 500;
const EVENTO = "2026-07-18";
// Início do eixo do gráfico (abertura das vendas do 4º Encontro).
const INICIO = "2026-04-19";

const dayMs = 86_400_000;
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso + "T12:00Z") + n * dayMs).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) =>
  Math.round((Date.parse(b + "T12:00Z") - Date.parse(a + "T12:00Z")) / dayMs);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function isEncontroTicket(product: string): boolean {
  return product.toLowerCase().startsWith("4º encontro");
}

export default async function EncontroPage() {
  const data = await getDashboardData();
  const today = isoToday();

  const tickets = paidSales(data.sales).filter((s) => isEncontroTicket(s.product));
  const vendidos = tickets.length;
  const receita = tickets.reduce((a, s) => a + s.amount, 0);
  const cortesias = tickets.filter((s) => s.amount === 0).length;

  // Quebra por tipo de ingresso (Start / VIP / 2ª cadeira / Black Friday).
  const tipoDe = (p: string): string => {
    const l = p.toLowerCase();
    if (l.includes("2ª cadeira")) return l.includes("vip") ? "VIP · 2ª cadeira" : "Start · 2ª cadeira";
    if (l.includes("black friday")) return "Black Friday (cortesia)";
    if (l.includes("vip")) return "VIP";
    if (l.includes("start")) return "Start";
    return "Outros";
  };
  const porTipo = new Map<string, { n: number; receita: number }>();
  for (const t of tickets) {
    const k = tipoDe(t.product);
    const e = porTipo.get(k) ?? { n: 0, receita: 0 };
    e.n += 1;
    e.receita += t.amount;
    porTipo.set(k, e);
  }
  const tipos = [...porTipo.entries()]
    .map(([tipo, v]) => ({ tipo, ...v }))
    .sort((a, b) => b.n - a.n);

  // Acumulado por dia, do início das vendas até hoje. Venda anterior ao início
  // do eixo (se houver) entra no saldo do primeiro ponto, não some.
  const byDay = new Map<string, number>();
  let acc = 0;
  for (const t of tickets) {
    if (t.saleDate < INICIO) acc += 1;
    else byDay.set(t.saleDate, (byDay.get(t.saleDate) ?? 0) + 1);
  }
  const serie: { date: string; realizado: number | null; projecao: number | null }[] = [];
  for (let d = INICIO; d <= today; d = addDays(d, 1)) {
    acc += byDay.get(d) ?? 0;
    serie.push({ date: ddmm(d), realizado: acc, projecao: null });
  }

  // Ritmo: média dos últimos 7 dias corridos (ingresso vende no fim de semana).
  const vendas7 = tickets.filter((t) => t.saleDate > addDays(today, -7)).length;
  const ritmo = vendas7 / 7;

  // Projeção no ritmo atual: até o evento e, se a meta ficar depois, até bater
  // a meta (máx. 90 dias além do evento pra não desenhar infinito).
  const diasAteEvento = Math.max(0, diffDays(today, EVENTO));
  const projEvento = Math.round(vendidos + ritmo * diasAteEvento);
  const diasParaMeta = ritmo > 0 ? Math.ceil((META - vendidos) / ritmo) : null;
  const dataMeta = diasParaMeta !== null ? addDays(today, diasParaMeta) : null;
  const horizonte =
    dataMeta && dataMeta > EVENTO
      ? dataMeta <= addDays(EVENTO, 90)
        ? dataMeta
        : addDays(EVENTO, 90)
      : EVENTO;
  let proj = vendidos;
  serie[serie.length - 1].projecao = vendidos; // emenda as duas linhas
  for (let d = addDays(today, 1); d <= horizonte; d = addDays(d, 1)) {
    proj += ritmo;
    serie.push({ date: ddmm(d), realizado: null, projecao: Math.round(proj) });
  }

  const faltam = Math.max(0, META - vendidos);
  const ritmoNecessario = diasAteEvento > 0 ? faltam / diasAteEvento : null;
  const bateAntes = dataMeta !== null && dataMeta <= EVENTO;

  return (
    <div>
      <PageHeader
        title="4º Encontro de Anfitriões — ingressos"
        subtitle={`Corrida até a meta de ${num(META)} ingressos · evento em ${ddmm(EVENTO)}`}
      />
      <DemoBanner show={data.isDemo} />

      <div
        className={`mb-4 rounded-lg border px-4 py-3 text-sm font-semibold ${
          bateAntes
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}
      >
        {ritmo === 0
          ? "Sem vendas nos últimos 7 dias — sem ritmo, a projeção não anda."
          : bateAntes
            ? `✅ No ritmo atual (${num(ritmo, 1)}/dia), a meta de ${num(META)} sai em ${ddmm(dataMeta!)} — antes do evento`
            : `🟠 No ritmo atual (${num(ritmo, 1)}/dia), você chega ao evento com ~${num(projEvento)} ingressos — a meta de ${num(META)} só sairia em ${dataMeta ? ddmm(dataMeta) : "—"}. Pra bater até ${ddmm(EVENTO)}, precisa vender ~${num(ritmoNecessario ?? 0, 1)}/dia`}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <KpiCard
          label="Ingressos vendidos"
          value={num(vendidos)}
          hint={`de ${num(META)} · faltam ${num(faltam)}`}
          tone="good"
        />
        <KpiCard label="Média/dia (últimos 7)" value={num(ritmo, 1)} hint={`${num(vendas7)} na semana`} />
        <KpiCard
          label={`Projeção pra ${ddmm(EVENTO)}`}
          value={`~${num(projEvento)}`}
          hint="no ritmo dos últimos 7 dias"
          tone={projEvento >= META ? "good" : "warn"}
        />
        <KpiCard
          label="Ritmo pra bater a meta"
          value={ritmoNecessario !== null ? `${num(ritmoNecessario, 1)}/dia` : "—"}
          hint={`nos ${num(diasAteEvento)} dias que restam`}
        />
      </div>

      <Card title={`Vendidos × meta de ${num(META)}`} className="mb-4">
        <GoalPaceChart data={serie} goal={META} goalLabel={`meta ${num(META)}`} eventDate={ddmm(EVENTO)} />
        <p className="mt-2 text-xs text-slate-400">
          Linha cheia = acumulado vendido · tracejada = projeção no ritmo médio dos últimos 7
          dias · pontilhada = meta de {num(META)} · vertical = dia do evento ({ddmm(EVENTO)}).
        </p>
      </Card>

      <Card title="Por tipo de ingresso">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400">
              <th className="py-1.5 font-medium">Tipo</th>
              <th className="py-1.5 font-medium text-right">Ingressos</th>
              <th className="py-1.5 font-medium text-right">Receita</th>
            </tr>
          </thead>
          <tbody>
            {tipos.map((t) => (
              <tr key={t.tipo} className="border-t border-slate-100">
                <td className="py-1.5 text-slate-700">{t.tipo}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">
                  {num(t.n)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-slate-700">{brl(t.receita)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200">
              <td className="py-1.5 font-semibold text-slate-900">Total</td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">
                {num(vendidos)}
              </td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">
                {brl(receita)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-400">
          Conta todo ingresso pago do 4º Encontro (Start, VIP, 2ª cadeiras e cortesias
          Black Friday — {num(cortesias)} saíram a R$ 0). Vendas via Eduzz.
        </p>
      </Card>
    </div>
  );
}
