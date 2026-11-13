import { Fragment } from "react";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { brl, num } from "@/lib/format";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import { DateRangePicker } from "@/components/DateRangePicker";
import { CallsPorDiaChart, PresencaBotoes } from "@/components/PainelCalls";
import {
  diaBR,
  funilDoPeriodo,
  inicioDoDia,
  lerCalls,
  pct,
  porAntecedencia,
  porDia,
  porHorario,
  porVendedor,
  primeiroNome,
  quandoBR,
  resumir,
  rotuloDia,
  somarDias,
  type CallPainel,
  type Faixa,
  type Taxa,
} from "@/lib/painel-calls";

// Painel Calls: as calls marcadas pelo Téo — quem apareceu, quem fechou e
// quanto vendeu. A régua (presença e venda da call) está no banco, na função
// painel_calls (migração 0084); as contas, em src/lib/painel-calls.ts.

export const dynamic = "force-dynamic";

// A gravação do Teams passou a funcionar em 09/11: antes disso não dá pra
// saber quem compareceu.
const INICIO_DADOS = "2026-11-09";
const AGENDA_DIAS = 7;

function chip(active: boolean): string {
  return `rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
    active
      ? "bg-slate-900 dark:bg-zinc-100 dark:text-zinc-900 text-white"
      : "bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/15"
  }`;
}

const SITUACAO: Record<string, { rotulo: string; cor: string; texto: string }> = {
  aconteceu: { rotulo: "Aconteceu", cor: "var(--calls-ok)", texto: "text-slate-800 dark:text-zinc-100" },
  falta: { rotulo: "Faltou", cor: "var(--calls-falta)", texto: "text-slate-800 dark:text-zinc-100" },
  apuracao: { rotulo: "Em apuração", cor: "var(--calls-espera)", texto: "text-slate-500 dark:text-zinc-400" },
  sem_dado: { rotulo: "Sem dado", cor: "var(--calls-espera)", texto: "text-slate-500 dark:text-zinc-400" },
  cancelada: { rotulo: "Cancelada", cor: "transparent", texto: "text-slate-400 dark:text-zinc-500" },
  futura: { rotulo: "Agendada", cor: "transparent", texto: "text-slate-500 dark:text-zinc-400" },
};

function Situacao({ c }: { c: CallPainel }) {
  const s = SITUACAO[c.situacao] ?? SITUACAO.apuracao;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${s.texto}`}>
      <span
        className={`inline-block h-2 w-2 rounded-full ${s.cor === "transparent" ? "border border-slate-400 dark:border-zinc-500" : ""}`}
        style={{ background: s.cor }}
      />
      {s.rotulo}
    </span>
  );
}

function comoSabemos(c: CallPainel): string {
  if (c.situacao === "cancelada") return "cancelou ou remarcou";
  if (c.situacao === "apuracao") return "esperando a gravação do Teams";
  if (c.situacao === "sem_dado") return "antes de o Teams gravar";
  if (c.fonte === "teams") return "gravação no Teams";
  if (c.fonte === "nota") return c.situacao === "aconteceu" ? "nota #call do vendedor" : "nota #faltou do vendedor";
  if (c.fonte === "painel") return "marcado no painel";
  if (c.fonte === "venda") return "venda ligada à call (sem esperar a gravação)";
  return "sem gravação e sem nota";
}

function Medidor({ t, fraco = false }: { t: Taxa; fraco?: boolean }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/[0.07] overflow-hidden">
      <div
        className={`h-full rounded-full ${fraco ? "opacity-50" : ""}`}
        style={{ width: `${Math.round((t.taxa ?? 0) * 100)}%`, background: "var(--calls-ok)" }}
      />
    </div>
  );
}

function Faixas({ faixas, vazio }: { faixas: Faixa[]; vazio: string }) {
  if (!faixas.length) return <p className="text-sm text-slate-400 dark:text-zinc-500">{vazio}</p>;
  return (
    <div className="space-y-3">
      {faixas.map((f) => {
        const poucas = f.comparecimento.base < 3;
        return (
          <div key={f.rotulo}>
            <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
              <span className="text-slate-700 dark:text-zinc-300">{f.rotulo}</span>
              <span className="tabular-nums text-slate-500 dark:text-zinc-400">
                {f.aconteceram}/{f.comparecimento.base} ·{" "}
                <span className="font-semibold text-slate-900 dark:text-zinc-100">{pct(f.comparecimento)}</span>
                {poucas && <span className="text-xs text-slate-400 dark:text-zinc-500"> (poucas calls)</span>}
              </span>
            </div>
            <Medidor t={f.comparecimento} fraco={poucas} />
          </div>
        );
      })}
    </div>
  );
}

const TH = "py-2 pr-4 font-medium whitespace-nowrap";
const TD = "py-2 pr-4 align-top";

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; v?: string }>;
}) {
  const sp = await searchParams;
  const agoraData = new Date();
  const hoje = diaBR(agoraData);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.from && re.test(sp.from) ? sp.from : INICIO_DADOS;
  const to = sp.to && re.test(sp.to) ? sp.to : hoje;
  const vendedor = sp.v?.trim() || null;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return (
      <div>
        <PageHeader title="Painel Calls" />
        <Card>
          <p className="text-sm text-slate-500 dark:text-zinc-400">Supabase não configurado.</p>
        </Card>
      </div>
    );
  }

  const de = inicioDoDia(from);
  const ate = inicioDoDia(somarDias(to, 1));
  const agora = agoraData.getTime();
  // Uma consulta só cobre o período, a agenda dos próximos dias e as calls dos
  // leads da coorte do funil (que podem cair depois do fim do período).
  const rpcDe = new Date(Math.min(Date.parse(de), agora)).toISOString();
  const rpcAte = new Date(Math.max(Date.parse(ate), agora + (AGENDA_DIAS + 1) * 86400_000)).toISOString();
  const [{ data: rows, error }, { data: conversas }, { data: cfg }] = await Promise.all([
    supabase.rpc("painel_calls", { p_de: rpcDe, p_ate: rpcAte }),
    // Falaram com o Téo no período: conversa começou ou teve resposta dele no período.
    supabase
      .from("teo_conversas")
      .select("contact_id")
      .or(`and(criado_em.gte."${de}",criado_em.lt."${ate}"),and(ultima_resposta_em.gte."${de}",ultima_resposta_em.lt."${ate}")`)
      .limit(10000),
    supabase.from("teo_config").select("vendedores").eq("id", 1).maybeSingle(),
  ]);

  const nomes = ((cfg?.vendedores ?? []) as { nome: string }[]).map((v) => v.nome).filter(Boolean);
  const todas = lerCalls(rows as Record<string, unknown>[] | null);
  const filtradas = vendedor ? todas.filter((c) => c.vendedor === vendedor) : todas;
  const t0 = Date.parse(de);
  const t1 = Date.parse(ate);
  const doPeriodo = filtradas.filter((c) => {
    const t = Date.parse(c.inicio);
    return t >= t0 && t < t1;
  });

  const r = resumir(doPeriodo);
  const dias = porDia(doPeriodo, from, to);
  const vendedores = porVendedor(doPeriodo, vendedor ? [vendedor] : nomes);
  const antecedencia = porAntecedencia(doPeriodo);
  const horario = porHorario(doPeriodo);
  const funil = funilDoPeriodo(doPeriodo, vendedor ? null : (conversas ?? []).map((c) => c.contact_id as string));
  const origens = Object.entries(r.receitaPorOrigem).sort((a, b) => b[1] - a[1]);
  const limiteAgenda = agora + AGENDA_DIAS * 86400_000;
  const proximas = filtradas.filter((c) => c.situacao === "futura" && Date.parse(c.inicio) <= limiteAgenda);
  const lista = doPeriodo.filter((c) => c.situacao !== "futura").reverse();
  const ticket = r.fechamento.ok ? r.receita / r.fechamento.ok : null;

  const params = (v: string | null) => {
    const p = new URLSearchParams();
    if (sp.from) p.set("from", from);
    if (sp.to) p.set("to", to);
    if (v) p.set("v", v);
    const s = p.toString();
    return s ? `/calls?${s}` : "/calls";
  };

  const comp = r.comparecimento.taxa;
  const agendaPorDia = new Map<string, CallPainel[]>();
  for (const c of proximas) {
    const d = diaBR(c.inicio);
    agendaPorDia.set(d, [...(agendaPorDia.get(d) ?? []), c]);
  }
  const maxFunil = Math.max(1, ...funil.etapas.map((e) => e.valor));

  return (
    <div>
      <PageHeader
        title="Painel Calls"
        subtitle="Calls marcadas pelo Téo: quem apareceu, quem fechou e quanto vendeu. Venda da call é a paga em até 48h, ligada ao lead por e-mail, telefone ou nome."
      />

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-rose-600 dark:text-rose-400">Não consegui ler as calls: {error.message}</p>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <DateRangePicker minYear={2026} placeholder="Desde 09/11" />
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" />
        <Link href={params(null)} className={chip(!vendedor)} scroll={false}>
          Todos
        </Link>
        {nomes.map((n) => (
          <Link key={n} href={params(n)} className={chip(vendedor === n)} scroll={false}>
            {primeiroNome(n)}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-3">
        <KpiCard
          label="Aconteceram"
          value={num(r.aconteceram)}
          hint={`de ${num(r.marcadas)} marcadas${r.apuracao ? ` · ${r.apuracao} em apuração` : ""}`}
        />
        <KpiCard
          label="Comparecimento"
          value={pct(r.comparecimento)}
          hint={r.comparecimento.base ? `${r.comparecimento.ok} de ${r.comparecimento.base} apuradas` : "nenhuma apurada"}
          tone={comp === null ? "neutral" : comp >= 0.7 ? "good" : comp < 0.5 ? "bad" : "warn"}
        />
        <KpiCard
          label="Fechamento em call"
          value={pct(r.fechamento)}
          hint={`${r.fechamento.ok} de ${r.fechamento.base} · venda em até 48h`}
        />
        <KpiCard
          label="Receita das calls"
          value={brl(r.receita)}
          hint={
            ticket === null
              ? "nenhuma venda ainda"
              : origens.length
                ? `${origens.map(([o, v]) => `${o} ${brl(v)}`).join(" · ")}${origens.some(([o]) => o === "TMB") ? "" : " · TMB R$ 0"}`
                : `ticket médio ${brl(ticket)}`
          }
        />
        <KpiCard
          label="Duração média"
          value={r.duracaoMedia !== null ? `${num(r.duracaoMedia)} min` : "—"}
          hint={r.duracaoBase ? `${r.duracaoBase} calls gravadas` : "sem gravação no período"}
        />
        <KpiCard
          label="Faltaram e compraram"
          value={num(r.faltaramMasCompraram.length)}
          hint={r.faltaramMasCompraram.length ? "pode ser call fora do Teams sem nota" : "em até 48h da call"}
          tone={r.faltaramMasCompraram.length ? "warn" : "neutral"}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-zinc-400 mb-6">
        {num(r.canceladas)} canceladas ou remarcadas · {num(r.foraDoTeams)} aconteceram fora do Teams (nota ou painel)
        {r.semDado ? ` · ${num(r.semDado)} sem dado (antes de 09/11)` : ""} · {num(proximas.length)} agendadas nos próximos{" "}
        {AGENDA_DIAS} dias
      </p>

      <Card title="Calls por dia" className="mb-4">
        {doPeriodo.length ? (
          <CallsPorDiaChart data={dias} />
        ) : (
          <p className="text-sm text-slate-400 dark:text-zinc-500">Nenhuma call do Téo neste período.</p>
        )}
      </Card>

      <Card title="Por vendedor" className="mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-white/10">
                  <th className={TH}>Vendedor</th>
                  <th className={`${TH} text-right hidden sm:table-cell`}>Marcadas</th>
                  <th className={`${TH} text-right`}>Aconteceram</th>
                  <th className={`${TH} text-right hidden sm:table-cell`}>Faltas</th>
                  <th className={`${TH} pl-4 w-40 hidden md:table-cell`}>Comparecimento</th>
                  <th className={`${TH} text-right`}>Fechou</th>
                  <th className={`${TH} text-right hidden sm:table-cell`}>Receita</th>
                  <th className={`${TH} text-right hidden lg:table-cell`}>Duração</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((l) => (
                  <tr key={l.vendedor} className="border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                    <td className={`${TD} whitespace-nowrap`}>
                      <Link href={params(l.vendedor)} className="font-medium text-slate-800 dark:text-zinc-200 hover:underline">
                        {l.vendedor}
                      </Link>
                    </td>
                    <td className={`${TD} text-right tabular-nums text-slate-600 dark:text-zinc-400 hidden sm:table-cell`}>{l.marcadas}</td>
                    <td className={`${TD} text-right tabular-nums font-medium text-slate-800 dark:text-zinc-200`}>
                      {l.aconteceram}
                    </td>
                    <td className={`${TD} text-right tabular-nums text-slate-600 dark:text-zinc-400 hidden sm:table-cell`}>{l.faltas}</td>
                    <td className={`${TD} pl-4 hidden md:table-cell`}>
                      <div className="tabular-nums text-xs text-slate-700 dark:text-zinc-300 mb-1">{pct(l.comparecimento)}</div>
                      <Medidor t={l.comparecimento} />
                    </td>
                    <td className={`${TD} text-right tabular-nums text-slate-700 dark:text-zinc-300`}>
                      {l.fechamento.ok}
                      <span className="text-xs text-slate-400 dark:text-zinc-500"> · {pct(l.fechamento)}</span>
                    </td>
                    <td className={`${TD} text-right tabular-nums text-slate-700 dark:text-zinc-300 hidden sm:table-cell`}>
                      {l.receita ? brl(l.receita) : "—"}
                    </td>
                    <td className={`${TD} text-right tabular-nums text-slate-600 dark:text-zinc-400 hidden lg:table-cell`}>
                      {l.duracaoMedia !== null ? `${num(l.duracaoMedia)} min` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-3">
            Fechou: calls que aconteceram e viraram venda paga em até 48h. Comparecimento: aconteceram ÷ (aconteceram + faltas).
          </p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
        <Card title="Funil das calls">
          <div className="space-y-3">
            {funil.etapas.map((e, i) => {
              const anterior = i > 0 ? funil.etapas[i - 1].valor : null;
              return (
                <div key={e.rotulo}>
                  <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
                    <span className="text-slate-700 dark:text-zinc-300">{e.rotulo}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold text-slate-900 dark:text-zinc-100">{num(e.valor)}</span>
                      {anterior !== null && (
                        <span className="text-xs text-slate-400 dark:text-zinc-500"> · {pct(anterior ? e.valor / anterior : null)}</span>
                      )}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded bg-slate-100 dark:bg-white/[0.07] overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${(e.valor / maxFunil) * 100}%`, background: "var(--calls-ok)" }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-4">
            {vendedor
              ? `Leads de ${primeiroNome(vendedor)} com call no período.`
              : "Falaram com o Téo: conversa que começou ou teve resposta dele no período (mais quem marcou call)."}{" "}
            Lead com mais de uma call conta uma vez; o % compara com a etapa anterior.
            {funil.emApuracao ? ` Mais ${funil.emApuracao} com a call em apuração.` : ""}
          </p>
        </Card>
        <Card title="Comparecimento pela antecedência">
          <Faixas faixas={antecedencia} vazio="Nenhuma call apurada no período." />
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-4">Do dia em que o lead marcou até o dia da call.</p>
        </Card>
        <Card title="Comparecimento por horário">
          <Faixas faixas={horario} vazio="Nenhuma call apurada no período." />
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-4">Hora de início da call (Brasília).</p>
        </Card>
      </div>

      {r.faltaramMasCompraram.length > 0 && (
        <Card title="Faltaram e compraram em até 48h" className="mb-4">
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-3">
            Sem gravação e sem nota, mas o lead comprou depois. Se a call aconteceu fora do Teams, o vendedor deixa a nota #call na
            conversa (ou marque aqui).
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {r.faltaramMasCompraram.map((c) => (
              <li key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-slate-700 dark:text-zinc-300">
                  <span className="font-medium">{c.nome ?? "—"}</span> · {primeiroNome(c.vendedor)} · {quandoBR(c.inicio)} →{" "}
                  {brl(c.vendaValor ?? 0)} ({c.vendaProduto})
                </span>
                <PresencaBotoes id={c.id} situacao={c.situacao} fonte={c.fonte} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`Próximas calls (${AGENDA_DIAS} dias)`} className="mb-4">
        {proximas.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-zinc-500">Nenhuma call agendada.</p>
        ) : (
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-white/10">
                  <th className={TH}>Hora</th>
                  <th className={TH}>Lead</th>
                  <th className={TH}>Vendedor</th>
                  <th className={`${TH} hidden sm:table-cell`}>Marcou</th>
                  <th className={TH}>Véspera</th>
                  <th className={`${TH} hidden sm:table-cell`}>Lembrete</th>
                </tr>
              </thead>
              <tbody>
                {[...agendaPorDia.entries()].map(([dia, calls]) => (
                  <Fragment key={dia}>
                  <tr>
                    <td
                      colSpan={6}
                      className="pt-3 pb-1 font-mono text-[10px] font-medium uppercase tracking-widest text-slate-500 dark:text-zinc-400"
                    >
                      {dia === hoje ? "Hoje" : rotuloDia(dia)} · {calls.length} {calls.length === 1 ? "call" : "calls"}
                    </td>
                  </tr>
                  {calls.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                      <td className={`${TD} tabular-nums text-slate-700 dark:text-zinc-300`}>{quandoBR(c.inicio).split(" ")[2]}</td>
                      <td className={`${TD} text-slate-800 dark:text-zinc-200`}>{c.nome ?? "—"}</td>
                      <td className={`${TD} text-slate-600 dark:text-zinc-400`}>{primeiroNome(c.vendedor)}</td>
                      <td className={`${TD} text-slate-500 dark:text-zinc-400 tabular-nums hidden sm:table-cell`}>
                        {c.criadoEm ? quandoBR(c.criadoEm).split(" ").slice(1).join(" ") : "—"}
                      </td>
                      <td className={`${TD} text-xs`}>
                        {c.vesperaEm ? (
                          <span className="text-slate-700 dark:text-zinc-300">✓ enviada</span>
                        ) : (
                          <span className="text-slate-400 dark:text-zinc-500">—</span>
                        )}
                      </td>
                      <td className={`${TD} text-xs hidden sm:table-cell`}>
                        {c.lembreteEm ? (
                          <span className="text-slate-700 dark:text-zinc-300">✓ enviado</span>
                        ) : (
                          <span className="text-slate-400 dark:text-zinc-500">~1h30 antes</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Calls do período (${lista.length})`} className="mb-4">
        {lista.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-zinc-500">Nenhuma call já passada neste período.</p>
        ) : (
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-white/10">
                  <th className={TH}>Quando</th>
                  <th className={TH}>Lead</th>
                  <th className={`${TH} hidden md:table-cell`}>Vendedor</th>
                  <th className={TH}>Situação</th>
                  <th className={`${TH} text-right hidden lg:table-cell`}>Duração</th>
                  <th className={`${TH} hidden sm:table-cell`}>Venda em 48h</th>
                  <th className={`${TH} hidden sm:table-cell`}>Corrigir</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-100 dark:border-white/[0.06] last:border-0 ${c.situacao === "cancelada" ? "opacity-60" : ""}`}
                  >
                    <td className={`${TD} tabular-nums text-slate-600 dark:text-zinc-400`}>{quandoBR(c.inicio)}</td>
                    <td className={`${TD} text-slate-800 dark:text-zinc-200`}>
                      {c.nome ?? "—"}
                      {c.vendaValor !== null && (
                        <div className="sm:hidden text-xs font-semibold text-slate-900 dark:text-zinc-100 mt-0.5">
                          {brl(c.vendaValor)} · {c.vendaProduto}
                        </div>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-slate-600 dark:text-zinc-400 hidden md:table-cell`}>{primeiroNome(c.vendedor)}</td>
                    <td className={TD}>
                      <Situacao c={c} />
                      <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">{comoSabemos(c)}</div>
                      {c.presencaNota && (
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 max-w-xs">“{c.presencaNota}”</div>
                      )}
                      {c.situacao !== "cancelada" && (
                        <div className="sm:hidden mt-1.5">
                          <PresencaBotoes id={c.id} situacao={c.situacao} fonte={c.fonte} />
                        </div>
                      )}
                    </td>
                    <td className={`${TD} text-right tabular-nums text-slate-600 dark:text-zinc-400 hidden lg:table-cell`}>
                      {c.duracaoMin !== null ? `${num(c.duracaoMin)} min` : "—"}
                    </td>
                    <td className={`${TD} hidden sm:table-cell`}>
                      {c.vendaValor !== null ? (
                        <>
                          <div className="tabular-nums font-semibold text-slate-900 dark:text-zinc-100">{brl(c.vendaValor)}</div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400 max-w-56">
                            {c.vendaProduto}
                            {c.vendaOrigem ? ` · ${c.vendaOrigem}` : ""} · pelo {c.vendaPor}
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-300 dark:text-zinc-600">—</span>
                      )}
                    </td>
                    <td className={`${TD} hidden sm:table-cell`}>
                      {c.situacao !== "cancelada" && <PresencaBotoes id={c.id} situacao={c.situacao} fonte={c.fonte} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Como cada call é classificada">
        <ul className="text-sm text-slate-600 dark:text-zinc-400 space-y-1.5 list-disc pl-5">
          <li>
            <strong className="text-slate-800 dark:text-zinc-200">Aconteceu</strong>: gravação no Teams com fala do lead, nota do
            vendedor começando com <code>#call</code> na conversa do lead no Unnichat, marcação aqui no painel, ou venda ligada à
            call (essa confirma na hora, sem esperar a gravação).
          </li>
          <li>
            <strong className="text-slate-800 dark:text-zinc-200">Faltou</strong>: nota <code>#faltou</code>, marcação aqui, ou nada
            disso até a apuração (24h depois). Call fora do Teams sem nota conta como falta.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-zinc-200">Em apuração</strong>: menos de 24h desde a call, ou a gravação do
            Teams ainda não chegou. Fica fora das taxas.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-zinc-200">Venda da call</strong>: venda paga (Eduzz, Asaas ou TMB) em até 48h
            depois do início, do mesmo lead pelo e-mail do convite, pelo telefone do WhatsApp ou pelo nome. Cada venda conta uma
            vez só.
          </li>
          <li>
            A nota <code>#call</code> ou <code>#faltou</code> vale de 30 min antes até 48h depois da call e entra no painel em até
            30 min. A marcação aqui vale sobre a nota e a gravação; “Automático” desfaz.
          </li>
        </ul>
      </Card>
    </div>
  );
}
