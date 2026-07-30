import type { PoliticaDistribuicao } from "@/lib/politica-distribuicao";
import type { DistribuicaoStatus } from "@/lib/distribuicao";
import { brl, shortDate } from "@/lib/format";
import { FecharDistribuicao } from "@/components/FecharDistribuicao";

// Card da distribuição: o bolo livre, as duas fatias (cofre e sócios), o
// rateio por sócio e o quanto falta pra meta do cofre.
//
// O número grande NÃO é fechado no começo do mês: fica recalculando com o
// caixa real (patrocínio que entra dia 7 conta no dia 10) e só crava no dia
// útil anterior à transferência. Depois que o Pix sai, o extrato dá baixa.

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function CardDistribuicao({
  p,
  d,
}: {
  p: PoliticaDistribuicao;
  d?: DistribuicaoStatus | null;
}) {
  const progresso = Math.max(0, Math.min(100, p.progressoMeta ?? 0));
  const faltaMeta = Math.max(0, p.metaValor - p.cofreDepois);
  const jaPassou = p.dataDistribuicao < p.hoje;
  const cofreMandaNoColchao = p.cofreAntes >= p.pisoOperacional;

  const pago = (d?.realizado.total ?? 0) > 0;
  const cravado = Boolean(d?.fechado);
  const valor = d?.valor ?? p.aDistribuir;
  // Depois de cravado o vivo continua andando — mostra a diferença.
  const drift = cravado && d ? d.valorVivo - d.valor : 0;

  return (
    <div className="mb-4 rounded-xl border border-emerald-200 dark:border-emerald-500/25 bg-emerald-50/60 dark:bg-emerald-500/[0.07] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Distribuição de {shortDate(d?.dataDistribuicao ?? p.dataDistribuicao)}
              {jaPassou && !pago && " (já passou)"}
            </span>
            {pago ? (
              <Selo tom="emerald">
                paga{d?.realizado.primeiraData ? ` em ${shortDate(d.realizado.primeiraData)}` : ""}
              </Selo>
            ) : cravado ? (
              <Selo tom="violet">cravada</Selo>
            ) : (
              <Selo tom="amber">prévia — ainda mexe</Selo>
            )}
          </div>

          <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {brl(pago ? (d?.realizado.total ?? valor) : valor)}
          </div>

          <div className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            {pct(1 - p.percentualReserva)} do caixa livre · os outros{" "}
            {pct(p.percentualReserva)} ({brl(p.vaiProCofre)}) vão pro cofre
            {d && d.extraArredondamento > 0 && !pago && (
              <>
                {" "}
                · redondo pra cima ({brl(d.valorBruto)} + {brl(d.extraArredondamento)})
              </>
            )}
          </div>

          {d && !pago && (
            <div className="mt-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
              {cravado ? (
                <>
                  Cravada em {shortDate((d.fechadoEm ?? "").slice(0, 10))}
                  {d.fechadoPor && d.fechadoPor !== "auto" && ` por ${d.fechadoPor}`}.
                  {Math.abs(drift) >= 1 && (
                    <>
                      {" "}
                      Pelo caixa de agora daria {brl(d.valorVivo)} ({drift > 0 ? "+" : ""}
                      {brl(drift)}) — vale o valor cravado.
                    </>
                  )}
                </>
              ) : (
                <>
                  Ainda em aberto: recalcula sozinho até{" "}
                  <strong>{shortDate(d.dataFechamento)}</strong> (dia útil anterior à
                  transferência). Tudo que entrar até lá aumenta o bolo.
                </>
              )}
            </div>
          )}
        </div>

        <div className="min-w-[220px] flex-1 sm:max-w-xs">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-slate-500 dark:text-zinc-400">Cofre</span>
            <span className="font-semibold tabular-nums text-slate-700 dark:text-zinc-200">
              {brl(p.cofreDepois)}{" "}
              <span className="font-normal text-slate-400 dark:text-zinc-500">
                de {brl(p.metaValor)}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
              style={{ width: `${progresso}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500">
            {faltaMeta > 0 ? <>faltam {brl(faltaMeta)} · {progresso.toFixed(1)}%</> : "meta atingida"}
          </div>
        </div>
      </div>

      {/* Rateio entre os sócios */}
      {d && d.socios.length > 0 && (
        <div className="mt-4 grid gap-2 border-t border-emerald-200/70 dark:border-emerald-500/20 pt-3 sm:grid-cols-2">
          {d.socios.map((s) => {
            const sPago = s.pago > 0;
            return (
              <div
                key={s.id}
                className="rounded-lg border border-emerald-200/70 dark:border-emerald-500/20 bg-white/70 dark:bg-white/[0.03] px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                    {s.nome}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 dark:text-zinc-500">
                    {pct(s.percentual)}
                  </span>
                </div>
                <div className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 dark:text-zinc-100">
                  {brl(sPago ? s.pago : s.valor)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 dark:text-zinc-500">
                  {sPago ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓ transferido{s.pagoEm ? ` em ${shortDate(s.pagoEm)}` : ""}
                    </span>
                  ) : (
                    s.destino
                  )}
                </div>
                {/* Sócio que não retirou tudo deixou o resto de giro na empresa */}
                {sPago && s.valor - s.pago > 1 && (
                  <div className="mt-1 text-[11px] text-violet-600 dark:text-violet-300">
                    deixou {brl(s.valor - s.pago)} na empresa (cota era {brl(s.valor)})
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Como se chega no número */}
      <div className="mt-4 grid gap-x-6 gap-y-1.5 border-t border-emerald-200/70 dark:border-emerald-500/20 pt-3 text-xs sm:grid-cols-2">
        <Linha
          rotulo={`Caixa projetado em ${shortDate(p.dataDistribuicao)}`}
          valor={brl(p.caixaNaData)}
        />
        <Linha
          rotulo={
            cofreMandaNoColchao
              ? "− Colchão (cofre já acumulado)"
              : "− Piso operacional (giro)"
          }
          valor={`− ${brl(p.colchaoExigido)}`}
          tom="rose"
        />
        <Linha rotulo="= Caixa livre" valor={brl(p.disponivelTotal)} forte />
        <Linha
          rotulo={`− Cofre (${pct(p.percentualReserva)})`}
          valor={`− ${brl(p.vaiProCofre)}`}
          tom="rose"
        />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-500">
        O caixa livre é o <strong>menor saldo</strong> projetado entre{" "}
        {shortDate(p.dataDistribuicao)} e {shortDate(p.horizonte)} (o vale cai em{" "}
        {shortDate(p.diaDoVale)}, com {brl(p.menorCaixaDoPeriodo)}), já descontadas as contas
        do período — inclusive a fatura do Meta do mês que vem. Tirar esse valor não fura o
        colchão em nenhum dia.
        {!cofreMandaNoColchao && (
          <>
            {" "}
            Enquanto o cofre for menor que o piso de {brl(p.pisoOperacional)}, quem trava o
            saque é o piso — guardar não custa distribuição neste momento.
          </>
        )}
        {d && !pago && !cravado && (
          <>
            {" "}
            O valor crava em {shortDate(d.dataFechamento)} e a transferência sai em{" "}
            {shortDate(d.dataDistribuicao)}; quando o Pix cair pros sócios (±5 dias da data),
            a baixa é automática pelo extrato.
          </>
        )}
      </p>

      {d?.podeFechar && !pago && <FecharDistribuicao valor={d.valorVivo} />}
    </div>
  );
}

function Selo({
  tom,
  children,
}: {
  tom: "emerald" | "amber" | "violet";
  children: React.ReactNode;
}) {
  const cor =
    tom === "emerald"
      ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : tom === "violet"
        ? "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300"
        : "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cor}`}>
      {children}
    </span>
  );
}

function Linha({
  rotulo,
  valor,
  tom,
  forte,
}: {
  rotulo: string;
  valor: string;
  tom?: "rose";
  forte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={forte ? "text-slate-600 dark:text-zinc-300" : "text-slate-500 dark:text-zinc-400"}>
        {rotulo}
      </span>
      <span
        className={`tabular-nums ${
          tom === "rose"
            ? "text-rose-600 dark:text-rose-400"
            : forte
              ? "font-semibold text-slate-900 dark:text-zinc-100"
              : "text-slate-700 dark:text-zinc-200"
        }`}
      >
        {valor}
      </span>
    </div>
  );
}
