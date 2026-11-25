import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import { AlertasIntegracao } from "@/components/AlertasIntegracao";
import { CiclosChart } from "@/components/TrafegoMeta";
import {
  brl,
  brl2,
  diaBR,
  faturaDoCiclo,
  faturamento,
  normalizar,
  rotuloCiclo,
  situacao,
  vezes,
  type CicloMeta,
} from "@/lib/trafego-meta";

// Tráfego da Meta (Fernando, 25/11: "quanto estamos gastando de tráfego no
// ciclo atual da meta, e quanto gastamos nos ciclos passados, e quando teremos
// que pagar por ele. Também preciso saber quanto tem de faturamento atribuído
// àquele ciclo"). Faturas e gasto direto da Meta (migração 0149).

export const dynamic = "force-dynamic";

const TH = "px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2";
const TD = "px-2 py-2 tabular-nums";

function hojeSP(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10);
}

function quando(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function emDias(dias: number): string {
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias > 1) return `em ${dias} dias`;
  return dias === -1 ? "venceu ontem" : `venceu há ${-dias} dias`;
}

function Selo({ c, hoje }: { c: CicloMeta; hoje: string }) {
  const s = situacao(c, hoje);
  const base = "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold";
  if (s.tipo === "paga") return <span className={`${base} bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`}>✓ Paga</span>;
  if (s.tipo === "aberta")
    return (
      <span className={`${base} ${s.dias < 0 ? "bg-rose-500/10 text-rose-700 dark:text-rose-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
        {s.dias < 0 ? "⚠ Vencida" : "● Em aberto"}
      </span>
    );
  if (s.tipo === "prevista") return <span className={`${base} bg-slate-500/10 text-ink-2`}>◌ Ciclo aberto</span>;
  return <span className={`${base} text-ink-2`}>Cobrado no cartão</span>;
}

export default async function TrafegoMetaPage() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return (
      <div>
        <PageHeader title="Tráfego da Meta" />
        <Card>Supabase não configurado.</Card>
      </div>
    );
  }
  const { data, error } = await supabase.rpc("painel_meta_trafego", { p_meses: 12 });
  if (error) {
    return (
      <div>
        <PageHeader title="Tráfego da Meta" />
        <Card>Não deu pra ler as faturas: {error.message}</Card>
      </div>
    );
  }
  const p = normalizar(data);
  const hoje = hojeSP();
  const mesAtual = `${hoje.slice(0, 8)}01`;
  const ciclos = p.ciclos.filter((c) => c.gasto > 0 || c.fatura != null || faturamento(c) > 0);
  const atual = p.ciclos.find((c) => c.mes === mesAtual) ?? null;
  const fator = p.fator_imposto ?? 1;

  // Próxima fatura a pagar: a de vencimento mais próximo ainda em aberto.
  const abertas = p.ciclos
    .filter((c) => (c.em_aberto ?? 0) > 0)
    .sort((a, b) => (a.vence_em ?? "").localeCompare(b.vence_em ?? ""));
  const proxima = abertas[0] ?? null;
  const totalAberto = abertas.reduce((s, c) => s + (c.em_aberto ?? 0), 0);
  const sProxima = proxima ? situacao(proxima, hoje) : null;
  const diasProxima = sProxima?.tipo === "aberta" ? sProxima.dias : 0;

  // Ritmo dos últimos 7 dias completos e projeção do ciclo aberto.
  const ultimos = p.gasto_dias.filter((d) => d.dia < hoje).slice(-7);
  const media7 = ultimos.length ? ultimos.reduce((s, d) => s + d.gasto, 0) / ultimos.length : 0;
  const diasNoMes = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0).getDate();
  const diasRestantes = diasNoMes - Number(hoje.slice(8, 10)) + 1;
  const gastoAtual = atual?.gasto ?? 0;
  const projecaoGasto = gastoAtual + media7 * diasRestantes;

  const saldoMeta = p.contas.reduce((s, c) => s + (c.saldo ?? 0), 0);

  // Onde a provisão de caixa diverge da fatura de verdade (só aviso; a
  // provisão não é alterada).
  const divergencias = p.ciclos
    .filter((c) => c.provisao != null && (c.situacao !== "Paid" || c.mes === mesAtual))
    .map((c) => ({ c, real: faturaDoCiclo(c) ?? 0 }))
    .filter(({ c, real }) => real > 0 && Math.abs(real - (c.provisao ?? 0)) / real > 0.1);

  const grafico = [...ciclos]
    .slice(0, 8)
    .reverse()
    .map((c) => ({
      rotulo: rotuloCiclo(c.mes),
      fatura: Math.round(faturaDoCiclo(c) ?? c.gasto),
      faturamento: Math.round(faturamento(c)),
      prevista: c.fatura == null && c.fatura_prevista != null,
    }));

  const erros = p.ultima_sync?.erros?.filter(Boolean) ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Tráfego da Meta"
        subtitle="Quanto gastamos de anúncio em cada ciclo de cobrança, quando cada fatura vence e quanto vendemos no mesmo mês."
      />

      <AlertasIntegracao chaves={["meta_anuncios", "meta_faturas"]} />

      {divergencias.length > 0 && (
        <div className="mb-4 rounded-[16px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {divergencias.map(({ c, real }) => (
            <p key={c.mes}>
              ⚠ A provisão de caixa espera {brl2(c.provisao ?? 0)} em {diaBR(c.provisao_data)} pela fatura de{" "}
              {rotuloCiclo(c.mes)}, mas {c.fatura != null ? "a fatura real é" : "a fatura deve ficar em torno de"}{" "}
              <strong>{brl2(real)}</strong>
              {c.vence_em ? ` (vence ${diaBR(c.vence_em)})` : c.vence_previsto ? ` (vence ≈ ${diaBR(c.vence_previsto)})` : ""}. Diferença:{" "}
              {brl(real - (c.provisao ?? 0))}.
            </p>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <KpiCard
          label="Próxima fatura a pagar"
          value={proxima ? brl2(proxima.em_aberto ?? 0) : "Nenhuma"}
          hint={
            proxima
              ? `ciclo de ${rotuloCiclo(proxima.mes)} · vence ${diaBR(proxima.vence_em)} (${emDias(diasProxima)})`
              : "nenhuma fatura em aberto"
          }
          tone={proxima ? (diasProxima < 0 ? "bad" : "warn") : "good"}
        />
        <KpiCard
          label={`Ciclo atual (${rotuloCiclo(mesAtual)})`}
          value={brl(gastoAtual)}
          hint={`gasto até agora · ≈ ${brl(gastoAtual * fator)} com impostos · vence ≈ ${diaBR(atual?.vence_previsto ?? null)}`}
        />
        <KpiCard
          label="Projeção do ciclo"
          value={brl(projecaoGasto * fator)}
          hint={`fatura no ritmo de ${brl(media7)}/dia (7 dias), com impostos`}
        />
        <KpiCard
          label="Faturamento no ciclo atual"
          value={brl(atual ? faturamento(atual) : 0)}
          hint={atual ? `${vezes(faturamento(atual), gastoAtual * fator)} a fatura até agora` : undefined}
          tone="good"
        />
      </div>

      <Card title="Fatura × faturamento por ciclo" className="mb-4 min-w-0">
        <CiclosChart data={grafico} />
        <p className="mt-2 text-xs text-ink-2">
          Fatura com impostos (a do ciclo aberto é prevista, pelo gasto até agora). Faturamento = tudo o que foi pago no
          mês: Eduzz, TMB e ingressos da Imersão.
        </p>
      </Card>

      <Card title="Ciclos" className="mb-4 min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Ciclo</th>
                <th className={`${TH} text-right`}>Gasto</th>
                <th className={`${TH} text-right`}>Fatura</th>
                <th className={TH}>Vencimento</th>
                <th className={TH}>Situação</th>
                <th className={`${TH} text-right`}>Na provisão</th>
                <th className={`${TH} text-right`}>Faturamento do mês</th>
                <th className={`${TH} text-right`}>Retorno</th>
                <th className={`${TH} text-right`}>Pixel da Meta</th>
              </tr>
            </thead>
            <tbody>
              {ciclos.map((c) => {
                const fat = faturaDoCiclo(c);
                const s = situacao(c, hoje);
                return (
                  <tr key={c.mes} className="border-b border-line/60 align-top">
                    <td className="whitespace-nowrap px-2 py-2 font-medium text-ink">
                      {rotuloCiclo(c.mes)}
                      {c.numeros && <div className="text-[11px] font-normal text-ink-2">nº {c.numeros}</div>}
                    </td>
                    <td className={`${TD} text-right text-ink-2`}>{brl(c.gasto)}</td>
                    <td className={`${TD} text-right font-semibold text-ink`}>
                      {fat != null ? (c.fatura != null ? brl2(fat) : `≈ ${brl(fat)}`) : "—"}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {c.vence_em ? diaBR(c.vence_em) : c.vence_previsto ? `≈ ${diaBR(c.vence_previsto)}` : "—"}
                      {s.tipo === "aberta" && <div className="text-[11px] text-ink-2">{emDias(s.dias)}</div>}
                    </td>
                    <td className="px-2 py-2">
                      <Selo c={c} hoje={hoje} />
                    </td>
                    <td className={`${TD} text-right text-ink-2`}>
                      {c.provisao != null ? brl(c.provisao) : "—"}
                      {c.provisao != null && c.provisao_data && <div className="text-[11px]">{diaBR(c.provisao_data)}</div>}
                    </td>
                    <td className={`${TD} text-right text-ink`}>
                      {brl(faturamento(c))}
                      <div className="text-[11px] text-ink-2">
                        Eduzz {brl(c.eduzz)}
                        {c.tmb > 0 && ` · TMB ${brl(c.tmb)}`}
                        {c.imersao > 0 && ` · Imersão ${brl(c.imersao)}`}
                      </div>
                    </td>
                    <td className={`${TD} text-right font-medium text-ink`}>{vezes(faturamento(c), fat ?? c.gasto)}</td>
                    <td className={`${TD} text-right text-ink-2`}>{c.compras_meta > 0 ? brl(c.compras_meta) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-2">
          A conta é de faturamento mensal (Net 30): o ciclo é o mês, a Meta emite a fatura no dia 1–2 do mês seguinte com os
          impostos (hoje ~{Math.round((fator - 1) * 1000) / 10}% sobre o gasto) e ela vence 30 dias depois. Mês sem fatura
          mensal foi cobrado direto no cartão. Retorno = faturamento do mês ÷ fatura; é blended, como no CAC/ROAS, porque
          quase nenhuma venda chega com UTM de anúncio. Pixel = compras que a própria Meta atribuiu aos anúncios.
        </p>
      </Card>

      <Card title="Saldo na Meta" className="mb-4 min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Conta de anúncio</th>
                <th className={TH}>Pagamento</th>
                <th className={`${TH} text-right`}>Ainda não pago</th>
              </tr>
            </thead>
            <tbody>
              {p.contas.map((c) => (
                <tr key={c.conta_id} className="border-b border-line/60">
                  <td className="px-2 py-2 text-ink">
                    {c.nome ?? c.conta_id}
                    <div className="text-[11px] text-ink-2">{c.conta_id}</div>
                  </td>
                  <td className="px-2 py-2 text-ink-2">{c.pagamento === "monthly invoicing" ? "Fatura mensal" : c.pagamento ?? "—"}</td>
                  <td className={`${TD} text-right font-medium text-ink`}>{brl2(c.saldo ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-2">
          {brl2(saldoMeta)} ainda não pagos = faturas em aberto ({brl2(totalAberto)}) + o gasto do ciclo aberto, que vira a
          próxima fatura.
        </p>
      </Card>

      <p className="text-xs text-ink-2">
        Fonte: Meta (faturas, saldo e gasto de cada conta), lido a cada 3 h; vendas do painel. As previsões da provisão de
        caixa não são alteradas por esta tela. Última leitura: {quando(p.ultima_sync?.em)}.
        {erros.length > 0 && <span className="text-amber-600 dark:text-amber-400"> Erros na última leitura: {erros.join(" · ")}</span>}
      </p>
    </div>
  );
}
