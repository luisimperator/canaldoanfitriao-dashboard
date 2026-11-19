import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { SyncButton } from "@/components/SyncButton";
import { ImersaoTurmaForm, type TurmaFormValores } from "@/components/ImersaoTurmaForm";
import { brl, num } from "@/lib/format";
import { TAG_FIXA, TURMA_COLS, diaSP, tagDatada, turmaParaCompra, type Turma } from "@/lib/imersao";
import { PlacarImersao, type Placar } from "@/components/PlacarImersao";

// Lançamento pago semanal (Imersão A5E, R$ 27): turmas, compradores, cliques
// nos links fixos (/imersao e /vip) e o funil de cada turma.

export const dynamic = "force-dynamic";

interface Resumo {
  turma_data: string;
  pagos: number;
  reembolsados: number;
  receita: number;
  mailchimp_pendentes: number;
  unnichat_pendentes: number;
  vip_cliques: number;
  vip_unicos: number;
  sabado_cliques: number;
  sabado_unicos: number;
  domingo_cliques: number;
  domingo_unicos: number;
  fora_cliques: number;
  lp_visitas: number;
  lp_unicos: number;
  checkout_cliques: number;
  checkout_unicos: number;
}

interface VarianteRow {
  variante: string;
  visitas: number;
  visitas_unicas: number;
  checkouts: number;
  checkouts_unicos: number;
}

interface CompradorRow {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  pago_em: string | null;
  valor: number | null;
  status: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  tags_mailchimp_ok: boolean;
  tags_unnichat_ok: boolean;
  tags_erro: string | null;
}

const fmtData = (dia: string) => {
  const [y, m, d] = dia.split("-");
  return `${d}/${m}/${y}`;
};
const fmtDataHora = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
// "09:00" no horário de São Paulo (valor do <input type="time">)
const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

function paraForm(t: Turma): TurmaFormValores {
  return {
    turma_data: t.turma_data,
    sala_url_sabado: t.sala_url_sabado ?? "",
    sala_url_domingo: t.sala_url_domingo ?? "",
    inicio_sabado: hhmm(t.inicio_sabado),
    fim_sabado: hhmm(t.fim_sabado),
    inicio_domingo: hhmm(t.inicio_domingo),
    fim_domingo: hhmm(t.fim_domingo),
    grupo_vip_url: t.grupo_vip_url ?? "",
    grupo_vip_url_2: t.grupo_vip_url_2 ?? "",
    grupo_vip_cheio: t.grupo_vip_cheio,
    ativa: t.ativa,
    unnichat_tag_id: t.unnichat_tag_id ?? "",
  };
}

// Base pública dos links fixos: o subdomínio de links quando configurado
// (NEXT_PUBLIC_SHORT_LINK_BASE), senão o próprio domínio do painel.
function baseLinks(): string {
  const short = process.env.NEXT_PUBLIC_SHORT_LINK_BASE?.trim().replace(/\/+$/, "").replace(/\/r$/, "");
  return short || "https://link.canaldoanfitriao.com.br";
}

async function todosCompradores(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  turma: string
): Promise<CompradorRow[]> {
  const out: CompradorRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("imersao_compradores")
      .select(
        "id, nome, email, telefone, pago_em, valor, status, utm_source, utm_medium, utm_campaign, utm_content, tags_mailchimp_ok, tags_unnichat_ok, tags_erro"
      )
      .eq("turma_data", turma)
      .order("pago_em", { ascending: false })
      .range(from, from + PAGE - 1);
    out.push(...((data ?? []) as CompradorRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export default async function LancamentoPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string }>;
}) {
  const { turma: turmaParam } = await searchParams;
  const supabase = getSupabaseAdmin();
  const base = baseLinks();
  const agora = new Date();
  const emVenda = turmaParaCompra(agora);

  if (!supabase) {
    return (
      <div>
        <PageHeader eyebrow="Lançamento pago" title="Imersão A5E" />
        <Card>Supabase não configurado.</Card>
      </div>
    );
  }

  const [{ data: turmasRaw, error: errTurmas }, { data: resumoRaw }] = await Promise.all([
    supabase.from("imersao_turmas").select(TURMA_COLS).order("turma_data", { ascending: false }).limit(60),
    supabase.from("imersao_resumo").select("*").order("turma_data", { ascending: false }).limit(60),
  ]);
  const turmas = (turmasRaw ?? []) as Turma[];
  const resumo = new Map(((resumoRaw ?? []) as Resumo[]).map((r) => [r.turma_data, r]));

  // Turma em foco: a pedida na URL; senão a que está vendendo agora; senão a mais recente.
  const foco =
    turmas.find((t) => t.turma_data === turmaParam) ??
    turmas.find((t) => t.turma_data === emVenda) ??
    turmas[0] ??
    null;
  const r = foco ? resumo.get(foco.turma_data) : undefined;
  const compradores = foco ? await todosCompradores(supabase, foco.turma_data) : [];
  const { data: variantesRaw } = foco
    ? await supabase
        .from("imersao_variantes")
        .select("variante, visitas, visitas_unicas, checkouts, checkouts_unicos")
        .eq("turma_data", foco.turma_data)
    : { data: [] };
  const variantes = ((variantesRaw ?? []) as VarianteRow[]).sort((a, b) => b.visitas_unicas - a.visitas_unicas);
  // Placar no formato do card do Foley (gasto CDR no Meta, ingressos, líquido, CPA).
  const { data: placarRaw } = foco
    ? await supabase.rpc("imersao_placar", { p_turma: foco.turma_data })
    : { data: null };
  const placar = (placarRaw ?? null) as Placar | null;

  // Sala agora (turma ativa = a mais próxima com fim_domingo >= agora).
  const ativa = [...turmas]
    .filter((t) => t.ativa && new Date(t.fim_domingo) >= agora)
    .sort((a, b) => a.turma_data.localeCompare(b.turma_data))[0];
  let salaAgora = "Sem turma ativa: /imersao mostra o aviso da próxima turma.";
  if (ativa) {
    const t = agora.getTime();
    const abre = (iso: string) => new Date(iso).getTime() - 30 * 60 * 1000;
    if (t >= abre(ativa.inicio_sabado) && t <= new Date(ativa.fim_sabado).getTime())
      salaAgora = ativa.sala_url_sabado ? "Aberta: /imersao leva para a sala de sábado." : "Sábado no ar, mas SEM link da sala de sábado!";
    else if (t >= abre(ativa.inicio_domingo) && t <= new Date(ativa.fim_domingo).getTime())
      salaAgora = ativa.sala_url_domingo ? "Aberta: /imersao leva para a sala de domingo." : "Domingo no ar, mas SEM link da sala de domingo!";
    else
      salaAgora = `Fechada. Turma ${fmtData(ativa.turma_data)}: a sala abre 30 min antes de cada dia.`;
  }

  // Origem dos compradores pagos da turma em foco.
  const pagos = compradores.filter((c) => c.status === "pago");
  const porOrigem = new Map<string, number>();
  for (const c of pagos) {
    const k = [c.utm_source ?? "(sem utm)", c.utm_medium, c.utm_campaign].filter(Boolean).join(" · ");
    porOrigem.set(k, (porOrigem.get(k) ?? 0) + 1);
  }
  const origens = [...porOrigem.entries()].sort((a, b) => b[1] - a[1]);

  const funil = r
    ? [
        { etapa: "Visitaram a LP", valor: r.lp_unicos, nota: `${num(r.lp_visitas)} visitas (turma à venda na hora da visita)` },
        { etapa: "Clicaram em comprar", valor: r.checkout_unicos, nota: `${num(r.checkout_cliques)} cliques no botão` },
        { etapa: "Compraram (pagos)", valor: r.pagos, nota: "ingressos pagos, sem reembolsos (inclui vendas que não passaram pela LP)" },
        { etapa: "Entraram no sábado (/imersao)", valor: r.sabado_unicos, nota: `${num(r.sabado_cliques)} cliques` },
        { etapa: "Entraram no domingo (/imersao)", valor: r.domingo_unicos, nota: `${num(r.domingo_cliques)} cliques` },
        { etapa: "Entraram no grupo VIP (QR na imersão)", valor: r.vip_unicos, nota: `${num(r.vip_cliques)} cliques em /vip` },
      ]
    : [];
  const topo = Math.max(1, ...funil.map((f) => f.valor));

  const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2";
  const td = "px-3 py-2 text-sm text-ink whitespace-nowrap";

  return (
    <div>
      <PageHeader
        eyebrow="Lançamento pago"
        title="Imersão A5E"
        subtitle={`Ingresso de R$ 27, turma toda semana (sábado e domingo, 9h às 16h). Quem compra agora entra na turma de ${fmtData(emVenda)}.`}
      />

      {placar && <PlacarImersao placar={placar} hoje={diaSP(agora)} />}

      {errTurmas && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Não consegui ler as turmas ({errTurmas.message}). A migração 0111 já foi aplicada?
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Links fixos">
          <div className="space-y-3 text-sm">
            {[
              { path: "/imersao-chuva-de-reservas-airbnb", desc: "LP de venda (versão longa): mostra a turma à venda e leva pro checkout com as UTMs." },
              { path: "/imersao-chuva-de-reservas-airbnb/curta", desc: "LP de venda, versão curta (teste de versões abaixo)." },
              { path: "/imersao", desc: "Sala do evento: leva pra sala do dia (abre 30 min antes)." },
              { path: "/vip", desc: "Grupo VIP da turma em andamento: vai no QR Code mostrado durante a imersão." },
            ].map((l) => (
              <div key={l.path} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <code className="break-all font-mono text-[13px] text-ink">{base + l.path}</code>
                  <div className="text-xs text-ink-2">{l.desc}</div>
                </div>
                <CopyButton text={base + l.path} />
              </div>
            ))}
            <p className="text-xs text-ink-2">
              A página de obrigado da Eduzz aponta pra <code>/imersao</code>. A sala recebe UTMs e nome/e-mail/telefone
              se vierem na URL. Pra fixar a turma do grupo: <code>/vip?turma=AAAA-MM-DD</code>.
            </p>
          </div>
        </Card>

        <Card title="Agora">
          <p className="text-sm text-ink">{salaAgora}</p>
          <p className="mt-3 text-xs text-ink-2">
            Tags aplicadas em cada compra: <code>{TAG_FIXA}</code> e <code>{tagDatada("AAAA-MM-DD")}</code> no Mailchimp
            (e no Unnichat, quando o contato e o id da tag existem). Reembolso tira as do Mailchimp.
          </p>
          <SyncButton path="/api/sync/imersao-tags" label="Retentar tags pendentes" />
        </Card>
      </div>

      <Card title="Turmas" className="mt-4">
        <div className="mb-4">
          <ImersaoTurmaForm sugestao={turmas.some((t) => t.turma_data === emVenda) ? undefined : emVenda} />
        </div>
        <div className="-mx-2 overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Turma</th>
                <th className={th}>Pagos</th>
                <th className={th}>Reemb.</th>
                <th className={th}>Receita</th>
                <th className={th}>LP → comprar</th>
                <th className={th}>VIP (únicos)</th>
                <th className={th}>Sábado</th>
                <th className={th}>Domingo</th>
                <th className={th}>Salas / grupo</th>
                <th className={th}>Tags pend.</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {turmas.map((t) => {
                const s = resumo.get(t.turma_data);
                const emFoco = foco?.turma_data === t.turma_data;
                return (
                  <tr key={t.turma_data} className={`border-b border-line align-top ${emFoco ? "bg-rose-500/[0.04]" : ""}`}>
                    <td className={td}>
                      <Link href={`/lancamento-pago?turma=${t.turma_data}`} className="font-semibold underline-offset-2 hover:underline">
                        {fmtData(t.turma_data)}
                      </Link>
                      <div className="text-[11px] text-ink-2">
                        {!t.ativa ? "inativa" : t.turma_data === emVenda ? "em venda" : new Date(t.fim_domingo) < agora ? "encerrada" : "futura"}
                      </div>
                    </td>
                    <td className={`${td} tabular-nums`}>{num(s?.pagos ?? 0)}</td>
                    <td className={`${td} tabular-nums`}>{num(s?.reembolsados ?? 0)}</td>
                    <td className={`${td} tabular-nums`}>{brl(Number(s?.receita ?? 0))}</td>
                    <td className={`${td} tabular-nums`}>
                      {num(s?.lp_unicos ?? 0)} → {num(s?.checkout_unicos ?? 0)}{" "}
                      <span className="text-ink-2">({pct(s?.pagos ?? 0, s?.lp_unicos ?? 0)} compra)</span>
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {num(s?.vip_unicos ?? 0)} <span className="text-ink-2">({pct(s?.vip_unicos ?? 0, s?.pagos ?? 0)})</span>
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {num(s?.sabado_unicos ?? 0)} <span className="text-ink-2">({pct(s?.sabado_unicos ?? 0, s?.pagos ?? 0)})</span>
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {num(s?.domingo_unicos ?? 0)} <span className="text-ink-2">({pct(s?.domingo_unicos ?? 0, s?.pagos ?? 0)})</span>
                    </td>
                    <td className={`${td} text-xs`}>
                      <span className={t.sala_url_sabado ? "" : "text-rose-600 dark:text-rose-400"}>sáb {t.sala_url_sabado ? "✓" : "falta"}</span>
                      {" · "}
                      <span className={t.sala_url_domingo ? "" : "text-rose-600 dark:text-rose-400"}>dom {t.sala_url_domingo ? "✓" : "falta"}</span>
                      {" · "}
                      <span className={t.grupo_vip_url || t.grupo_vip_url_2 ? "" : "text-rose-600 dark:text-rose-400"}>
                        vip {t.grupo_vip_url || t.grupo_vip_url_2 ? (t.grupo_vip_cheio ? "reserva" : "✓") : "falta"}
                      </span>
                    </td>
                    <td className={`${td} text-xs tabular-nums`}>
                      MC {num(s?.mailchimp_pendentes ?? 0)} · UC {num(s?.unnichat_pendentes ?? 0)}
                    </td>
                    <td className={td}>
                      <ImersaoTurmaForm key={`${t.turma_data}-${t.created_at}`} inicial={paraForm(t)} />
                    </td>
                  </tr>
                );
              })}
              {turmas.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-sm text-ink-2">
                    Nenhuma turma ainda. A primeira venda cria a turma sozinha (com horário padrão), mas os links das salas e
                    do grupo precisam ser cadastrados aqui.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {foco && r && (
        <>
          <div className="mt-6 mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Turma de {fmtData(foco.turma_data)}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Ingressos pagos" value={num(r.pagos)} hint={`${brl(Number(r.receita))}${r.reembolsados ? ` · ${num(r.reembolsados)} reembolsados` : ""}`} />
            <KpiCard label="Assistiram (sábado)" value={pct(r.sabado_unicos, r.pagos)} hint={`${num(r.sabado_unicos)} de ${num(r.pagos)} compradores`} />
            <KpiCard
              label="Ficaram até domingo"
              value={pct(r.domingo_unicos, r.sabado_unicos)}
              hint={`${num(r.domingo_unicos)} de ${num(r.sabado_unicos)} do sábado`}
              tone={r.sabado_unicos && r.domingo_unicos / r.sabado_unicos < 0.5 ? "warn" : "neutral"}
            />
            <KpiCard label="Entraram no grupo VIP" value={pct(r.vip_unicos, r.sabado_unicos)} hint={`${num(r.vip_unicos)} pessoas · % de quem assistiu`} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Funil da turma">
              <div className="space-y-3">
                {funil.map((f, i) => (
                  <div key={f.etapa}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-ink">{f.etapa}</span>
                      <span className="tabular-nums text-ink">
                        <strong>{num(f.valor)}</strong>
                        {i > 0 && <span className="ml-1 text-xs text-ink-2">{pct(f.valor, funil[i - 1].valor)} da etapa anterior</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
                      <div className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.max(2, (f.valor / topo) * 100)}%` }} />
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-2">{f.nota}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-ink-2">
                Únicos por pessoa: pelo e-mail quando vem na URL, senão por aparelho (IP + navegador) — é aproximado.
                {r.fora_cliques ? ` ${num(r.fora_cliques)} acessos a /imersao caíram fora do horário da sala.` : ""}
              </p>
            </Card>

            <Card title="Versões da LP (teste)">
              {variantes.length === 0 ? (
                <p className="text-sm text-ink-2">Sem visitas na LP nessa turma ainda.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={th}>Versão</th>
                      <th className={th}>Visitas</th>
                      <th className={th}>Clicaram em comprar</th>
                      <th className={th}>Taxa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantes.map((v) => (
                      <tr key={v.variante} className="border-b border-line">
                        <td className={td}>{v.variante}</td>
                        <td className={`${td} tabular-nums`}>{num(v.visitas_unicas)}</td>
                        <td className={`${td} tabular-nums`}>{num(v.checkouts_unicos)}</td>
                        <td className={`${td} tabular-nums font-semibold`}>{pct(v.checkouts_unicos, v.visitas_unicas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-3 text-[11px] text-ink-2">
                Pessoas únicas por versão (aproximado). A compra é atribuída pelas UTMs: use um utm_content diferente pra cada
                versão nos anúncios e compare em “De onde vieram os compradores”.
              </p>
            </Card>

            <Card title="De onde vieram os compradores">
              {origens.length === 0 ? (
                <p className="text-sm text-ink-2">Sem compradores pagos ainda.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {origens.slice(0, 15).map(([k, n]) => (
                    <li key={k} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-ink">{k}</span>
                      <span className="tabular-nums text-ink-2">
                        {num(n)} · {pct(n, pagos.length)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="mt-4">
            <details>
              <summary className="cursor-pointer text-[15px] font-semibold tracking-[-0.01em] text-ink">
                Compradores ({num(compradores.length)}) <span className="text-xs font-normal text-ink-2">· toque pra abrir a lista</span>
              </summary>
            <div className="-mx-2 mt-4 overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-line">
                    <th className={th}>Pago em</th>
                    <th className={th}>Nome</th>
                    <th className={th}>E-mail</th>
                    <th className={th}>Telefone</th>
                    <th className={th}>Valor</th>
                    <th className={th}>Status</th>
                    <th className={th}>Origem</th>
                    <th className={th}>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {compradores.map((c) => (
                    <tr key={c.id} className="border-b border-line">
                      <td className={td}>{fmtDataHora(c.pago_em)}</td>
                      <td className={td}>{c.nome ?? "—"}</td>
                      <td className={td}>{c.email ?? "—"}</td>
                      <td className={td}>{c.telefone ?? "—"}</td>
                      <td className={`${td} tabular-nums`}>{c.valor != null ? brl(Number(c.valor)) : "—"}</td>
                      <td className={td}>
                        <span className={c.status === "pago" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                          {c.status}
                        </span>
                      </td>
                      <td className={`${td} text-xs text-ink-2`}>
                        {[c.utm_source, c.utm_medium, c.utm_campaign, c.utm_content].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className={`${td} text-xs`} title={c.tags_erro ?? undefined}>
                        <span className={c.tags_mailchimp_ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                          MC {c.tags_mailchimp_ok ? "✓" : "…"}
                        </span>{" "}
                        <span className={c.tags_unnichat_ok ? "text-emerald-600 dark:text-emerald-400" : "text-ink-2"}>
                          UC {c.tags_unnichat_ok ? "✓" : "…"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {compradores.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-ink-2">
                        Nenhum comprador nessa turma ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </details>
          </Card>
        </>
      )}
    </div>
  );
}
