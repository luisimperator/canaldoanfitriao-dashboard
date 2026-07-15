import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { getProvisaoCaixa, somaAte, METODO_LABEL } from "@/lib/provisao-caixa";
import { getSaidasInter } from "@/lib/saidas-inter";
import { fundeDias, getProvisaoAsaas } from "@/lib/provisao-asaas";
import { CashCurveChart } from "@/components/CashCurveChart";
import { brl, shortDate } from "@/lib/format";
import { Card, DemoBanner, PageHeader } from "@/components/ui";
import { ProvisaoTimeline } from "@/components/ProvisaoTimeline";
import { ProvisaoRows } from "@/components/ProvisaoRows";
import { SaldoEduzzForm } from "@/components/SaldoEduzzForm";
import { SaidasProgramadas } from "@/components/SaidasProgramadas";

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

// 4º Encontro de Anfitriões — marcado na curva de caixa enquanto não passa.
const EVENTO = { dia: "2026-07-18", label: "4º Encontro" };

export default async function ProvisaoPage() {
  const data = await getDashboardData();
  const p = await getProvisaoCaixa();
  const [inter, asaas] = p
    ? await Promise.all([getSaidasInter(p.hoje), getProvisaoAsaas(p.hoje)])
    : [
        { ok: false, saidas: [] as never[] },
        { ok: false, erro: undefined, saldo: 0, pagoPorDia: [], vencerPorDia: [] },
      ];

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
  const disponivel = p.saldoInter + (saldoEduzz ?? 0) + asaas.saldo;

  // Eduzz + Asaas fundidos por dia (mesmo shape, mesmas séries do gráfico)
  const pagoAll = fundeDias(p.pagoPorDia, asaas.pagoPorDia);
  const vencerAll = fundeDias(p.aVencerPorDia, asaas.vencerPorDia);
  const aLiberarTotal = Math.round(pagoAll.reduce((a, d) => a + d.valor, 0));
  const aLiberarCobrancas = pagoAll.reduce((a, d) => a + d.cobrancas, 0);
  const aVencerTotal = Math.round(vencerAll.reduce((a, d) => a + d.valor, 0));
  const aVencerCobrancas = vencerAll.reduce((a, d) => a + d.cobrancas, 0);

  const corte30 = addDias(p.hoje, 30);
  const corteMes = fimDoMes(p.hoje);
  const mesNome = new Date(`${p.hoje}T12:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    timeZone: "UTC",
  });
  const mesCap = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);

  const d30 = {
    pago: somaAte(pagoAll, corte30),
    prev: somaAte(vencerAll, corte30),
  };
  const mes = {
    pago: somaAte(pagoAll, corteMes),
    prev: somaAte(vencerAll, corteMes),
  };

  // saídas previstas = agendados no Inter (boletos/pagamentos) + manuais
  const saidasFuturas = [
    ...inter.saidas.map((s) => ({ dia: s.data, valor: s.valor })),
    ...p.saidasProgramadas.map((s) => ({ dia: s.data, valor: s.valor })),
  ];
  const saidasMes = Math.round(
    saidasFuturas.filter((s) => s.dia <= corteMes).reduce((a, s) => a + s.valor, 0)
  );
  const interTotal = Math.round(inter.saidas.reduce((a, s) => a + s.valor, 0));
  const saldoFimMes = Math.round(disponivel + mes.pago + mes.prev - saidasMes);

  const emDias = (iso: string) => {
    const n = Math.round(
      (Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${p.hoje}T12:00:00Z`)) / 86_400_000
    );
    return n <= 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`;
  };

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
          subtitle="Quanto já caiu (Inter + Eduzz + Asaas) e quando o resto libera"
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
            {asaas.ok && <> · Asaas {brl(asaas.saldo)}</>}
          </div>
          <div className="mt-1.5">
            <SaldoEduzzForm atual={p.saldoEduzzAncora?.valor ?? null} />
          </div>
        </div>

        <div className="bg-white dark:bg-[#15121f] rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-4">
          <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
            A liberar {asaas.ok ? "(Eduzz + Asaas)" : "(Eduzz)"}
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums mt-1 text-amber-600 dark:text-amber-400">
            {brl(aLiberarTotal)}
          </div>
          <div className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
            {aLiberarCobrancas} cobranças pagas, ainda não creditadas
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

      <p className="mb-2 text-xs text-slate-400 dark:text-zinc-500">
        Valores líquidos (taxas da Eduzz e do Asaas já descontadas).
      </p>

      {!asaas.ok && "erro" in asaas && asaas.erro && (
        <div className="mb-4 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          Asaas fora da conta: {asaas.erro} Os números mostram só Eduzz + Inter por enquanto.
        </div>
      )}

      <Card title="Curva de caixa projetada" className="mb-4">
        <CashCurveChart
          hoje={p.hoje}
          disponivel={disponivel}
          entradas={[
            ...pagoAll.map((d) => ({
              dia: d.dia,
              valor: d.valor,
              nome: `Liberações pagas · ${d.cobrancas} cobrança${d.cobrancas === 1 ? "" : "s"}`,
            })),
            ...vencerAll.map((d) => ({
              dia: d.dia,
              valor: d.valor,
              nome: `A vencer (previsão) · ${d.cobrancas}`,
            })),
          ]}
          saidas={[
            ...inter.saidas.map((s) => ({ dia: s.data, valor: s.valor, nome: s.descricao })),
            ...p.saidasProgramadas.map((s) => ({
              dia: s.data,
              valor: s.valor,
              nome: s.prevista ? `${s.descricao} (previsão)` : s.descricao,
            })),
          ]}
          evento={EVENTO}
        />
        <p className="mt-2 text-xs text-slate-400 dark:text-zinc-500">
          Saldo dia a dia = disponível agora + liberações previstas − saídas previstas. Se a
          linha se aproxima do fundo de 10% (ou fura o zero), é disrupção de caixa à vista —
          antecipe recebíveis ou reagende saídas antes do vale.
        </p>
      </Card>

      <Card title="Linha do tempo de liberação" className="mb-4">
        <ProvisaoTimeline
          pago={pagoAll}
          vencer={vencerAll}
          disponivel={disponivel}
          hoje={p.hoje}
          saidas={saidasFuturas}
        />
      </Card>

      <Card title={`Liberações confirmadas — pago (${brl(aLiberarTotal)})`} className="mb-4">
        {pagoAll.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Nada pago aguardando liberação no momento — todo o dinheiro recebido já está disponível.
          </p>
        ) : (
          <ProvisaoRows dias={pagoAll} hoje={p.hoje} tone="emerald" />
        )}
      </Card>

      {vencerAll.length > 0 && (
        <Card title={`A vencer — previsão (${brl(aVencerTotal)})`} className="mb-4">
          <p className="mb-3 text-xs text-slate-400 dark:text-zinc-500">
            Cobranças ainda não pagas ({aVencerCobrancas}), assumindo pagamento no vencimento.
            Eduzz: mediana real por método ({lagLabel}).
            {asaas.ok && <> Asaas: cartão ~30d, Pix/boleto ~1d.</>}
          </p>
          <ProvisaoRows dias={vencerAll} hoje={p.hoje} tone="amber" />
        </Card>
      )}

      <Card title="Saídas previstas" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3 mb-4">
          <div>
            <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
              Agendado no Inter (60 dias)
            </div>
            <div className="text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {brl(interTotal)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
              Sai até o fim de {mesCap}
            </div>
            <div className="text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {brl(saidasMes)}
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

        {!inter.ok && (
          <div className="mb-3 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Não consegui listar os pagamentos agendados no Inter
            {"erro" in inter && inter.erro ? <> ({inter.erro})</> : null}. Se a integração ainda
            não tem a permissão, habilite o escopo <strong>Pagamento de boletos (consulta)</strong>{" "}
            na aplicação do Internet Banking PJ. Enquanto isso, cadastre as saídas na mão abaixo.
          </div>
        )}

        {inter.saidas.length > 0 && (
          <div className="mb-3 space-y-2">
            {inter.saidas.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    {s.descricao}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-zinc-500">
                    {shortDate(s.data)} · {emDias(s.data)} ·{" "}
                    <span className="rounded bg-slate-100 dark:bg-white/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                      agendado no Inter
                    </span>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">
                  − {brl(s.valor)}
                </span>
              </div>
            ))}
          </div>
        )}

        <SaidasProgramadas saidas={p.saidasProgramadas} hoje={p.hoje} />
      </Card>

      <p className="mt-4 text-xs text-slate-400 dark:text-zinc-500">
        Liberações pagas usam o creditDate exato da Eduzz e o estimatedCreditDate do Asaas.
        Datas com ~ são previsão: pagamento no vencimento + prazo mediano do método
        ({lagLabel}, medidos nos últimos 120 dias na Eduzz; no Asaas, cartão ~30d e Pix/boleto ~1d).
        O saldo Eduzz é informado manualmente e corrigido com o que liberou desde então.
        Saídas previstas: boletos e pagamentos agendados na conta do Inter (60 dias à frente)
        + saídas cadastradas na mão. Atualizado {atualizado}.
      </p>
    </div>
  );
}
