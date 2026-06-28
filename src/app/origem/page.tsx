import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { paidSales } from "@/lib/metrics";
import { leadOrigin, tagOrigin, youtubeFootprint, isMql, type OriginRow } from "@/lib/origin";
import { brl, num } from "@/lib/format";
import { Card, DemoBanner, KpiCard, PageHeader } from "@/components/ui";
import { classifyChannel, CHANNEL_COLOR, type Channel } from "@/lib/channels";

export const dynamic = "force-dynamic";

export default async function OrigemPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>;
}) {
  const data = await getDashboardData();

  // Anos disponíveis a partir dos leads (a origem vive no lead).
  const anos = [...new Set(data.leads.map((l) => l.createdAt.slice(0, 4)))]
    .filter(Boolean)
    .sort()
    .reverse();
  const { ano } = await searchParams;
  const anoSel = ano && anos.includes(ano) ? ano : "todos";

  const leads =
    anoSel === "todos"
      ? data.leads
      : data.leads.filter((l) => l.createdAt.slice(0, 4) === anoSel);
  const origin = leadOrigin(leads);
  const tagOrig = tagOrigin(leads);

  const maxChannelLeads = Math.max(1, ...origin.byChannel.map((r) => r.leads));
  const totalMql = leads.filter(isMql).length;
  const yt = youtubeFootprint(leads);
  // UTM detalhado só vira card quando há volume suficiente; abaixo disso vira
  // ruído de "0%". Até lá, a leitura é por campanha (tag), que cobre a base.
  const UTM_MIN = 30;
  const utmReady = origin.tracked >= UTM_MIN;

  // Faturamento por canal (origem da VENDA, via UTM da Eduzz) — visão de receita
  // que complementa a de captação. Filtra pelo mesmo ano selecionado.
  const sales = paidSales(data.sales).filter(
    (s) => anoSel === "todos" || s.saleDate.slice(0, 4) === anoSel
  );
  const revByChannel = new Map<Channel, number>();
  for (const s of sales) {
    const ch = classifyChannel(s.utm);
    revByChannel.set(ch, (revByChannel.get(ch) ?? 0) + s.amount);
  }
  const revRows = [...revByChannel.entries()]
    .map(([channel, revenue]) => ({ channel, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
  const totalRev = revRows.reduce((a, r) => a + r.revenue, 0);
  const maxRev = Math.max(1, ...revRows.map((r) => r.revenue));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Origem dos leads"
          subtitle="De onde vêm os leads e o que os trouxe — e qual origem gera lead que vira MQL"
        />
        <Link
          href="/origem/utm"
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Gerar link com UTM →
        </Link>
      </div>
      <DemoBanner show={data.isDemo} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link
          href="/origem"
          className={`rounded-full px-3 py-1.5 text-sm ${
            anoSel === "todos"
              ? "bg-rose-600 text-white font-semibold"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Todo o período
        </Link>
        {anos.map((a) => (
          <Link
            key={a}
            href={`/origem?ano=${a}`}
            className={`rounded-full px-3 py-1.5 text-sm ${
              anoSel === a
                ? "bg-rose-600 text-white font-semibold"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {a}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard label="Leads no período" value={num(origin.totalLeads)} />
        <KpiCard label="MQLs no período" value={num(totalMql)} tone="good" />
        <KpiCard
          label="Cobertura por campanha"
          value={`${num(tagOrig.coveredPct, 0)}%`}
          hint="têm tag de entrada"
        />
        <KpiCard
          label="Com origem detalhada (UTM)"
          value={num(origin.tracked)}
          hint="cresce com leads novos"
        />
      </div>

      <Card title="Origem por campanha (tag de entrada)" className="mb-6">
        <p className="mb-3 text-xs text-slate-400">
          Cobre {num(tagOrig.coveredPct, 0)}% da base — quase todo lead tem uma tag
          do Mailchimp dizendo o lançamento/LP de entrada, mesmo sem UTM. É a porta
          de entrada (não o vídeo exato). Uma lead pode ter mais de uma tag.
        </p>
        {tagOrig.rows.length === 0 ? (
          <p className="text-sm text-slate-400">Sem tags no período.</p>
        ) : (
          <ul className="space-y-2.5">
            {tagOrig.rows.map((r) => {
              const max = Math.max(1, ...tagOrig.rows.map((x) => x.leads));
              return (
                <li key={r.key}>
                  <div className="flex justify-between items-baseline gap-2 text-sm mb-1">
                    <span className="min-w-0 truncate text-slate-700" title={r.key}>
                      {r.key}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-900">
                      <span className="font-semibold">{num(r.leads)}</span>
                      <span className="text-slate-400 font-normal"> leads</span>
                      {r.mql > 0 && (
                        <>
                          <span className="text-slate-400 font-normal"> · </span>
                          <span className="font-semibold text-emerald-600">
                            {num(r.mql)} MQL
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-400"
                      style={{ width: `${Math.max(2, (r.leads / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {yt.total > 0 && (
        <Card title="YouTube (todos os sinais)" className="mt-6">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">{num(yt.total)}</p>
              <p className="text-xs text-slate-500">
                leads atribuídos ao YouTube ({num((yt.total / Math.max(1, origin.totalLeads)) * 100, 1)}% do total)
              </p>
            </div>
            <div>
              <p className="text-3xl font-bold text-emerald-600 tabular-nums">{num(yt.mql)}</p>
              <p className="text-xs text-slate-500">viraram MQL</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Junta os 3 sinais (sem repetir lead): <strong>{num(yt.viaTag)}</strong> por tag{" "}
            <code>-yt</code> · <strong>{num(yt.viaVidorigem)}</strong> por vídeo (vidorigem) ·{" "}
            <strong>{num(yt.viaSource)}</strong> por utm_source. Provavelmente ainda é
            subestimado: só parte dos links/QRs do YouTube carimba a origem. Usar o{" "}
            <Link href="/origem/utm" className="text-rose-600 hover:underline">
              gerador de link
            </Link>{" "}
            (source = youtube + vidorigem) em todo vídeo fecha esse buraco.
          </p>
        </Card>
      )}

      {!utmReady ? (
        <Card title="Origem detalhada (UTM) — em construção" className="mt-6">
          <p className="text-sm text-slate-600">
            As campanhas acima (tags) cobrem {num(tagOrig.coveredPct, 0)}% da base. A
            camada fina — <em>qual vídeo/anúncio exato</em> trouxe a pessoa
            (utm_content / vidorigem) — só existe pra{" "}
            <strong>{num(origin.tracked)}</strong> leads do período, pouco pra ranquear.
            Ela enche de duas formas: rodando o sync em{" "}
            <strong>Integrações → Sincronizar agora</strong> (puxa o UTM que o
            Mailchimp já tem) e, daqui pra frente, conforme os leads novos chegam
            com UTM. Quando passar de {UTM_MIN}, os rankings por canal/conteúdo/vídeo
            aparecem aqui.
          </p>
        </Card>
      ) : (
        <>
          <Card title="De onde vêm os leads (canal)">
            <p className="mb-3 text-xs text-slate-400">
              Entre os {num(origin.trackedPct, 0)}% de leads com rastreio. A barra
              é o volume; a porcentagem em destaque é quantos viraram MQL.
            </p>
            <div className="space-y-3">
              {origin.byChannel.map((r) => (
                <div key={r.channel}>
                  <div className="flex justify-between items-baseline text-sm mb-1">
                    <span className="flex items-center gap-2 text-slate-700">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: CHANNEL_COLOR[r.channel] }}
                      />
                      {r.channel}
                    </span>
                    <span className="tabular-nums text-slate-900">
                      <span className="font-semibold">{num(r.leads)}</span>
                      <span className="text-slate-400 font-normal"> leads · </span>
                      <span
                        className={`font-semibold ${
                          r.rate >= 0.15
                            ? "text-emerald-600"
                            : r.rate > 0
                            ? "text-slate-700"
                            : "text-slate-400"
                        }`}
                      >
                        {num(r.rate * 100, 1)}% MQL
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, (r.leads / maxChannelLeads) * 100)}%`,
                        background: CHANNEL_COLOR[r.channel],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <OriginListCard
              title="O que trouxe o lead (conteúdo / anúncio)"
              hint="utm_content — o criativo/vídeo que levou a pessoa à página"
              rows={origin.byContent}
            />
            <VideoOriginCard rows={origin.byVideo} />
          </div>

          <div className="mt-6">
            <OriginListCard
              title="Fonte bruta (utm_source)"
              hint="o que a landing page gravou como source — útil pra normalizar canais"
              rows={origin.bySource}
            />
          </div>
        </>
      )}

      {totalRev > 0 && (
        <Card title="Faturamento por canal (origem da venda)" className="mt-6">
          <p className="mb-3 text-xs text-slate-400">
            Receita classificada pela UTM gravada no checkout da Eduzz — visão de
            vendas, complementa a captação acima.
          </p>
          <div className="space-y-3">
            {revRows.map((r) => {
              const pct = totalRev > 0 ? (r.revenue / totalRev) * 100 : 0;
              return (
                <div key={r.channel}>
                  <div className="flex justify-between items-baseline text-sm mb-1">
                    <span className="flex items-center gap-2 text-slate-700">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: CHANNEL_COLOR[r.channel] }}
                      />
                      {r.channel}
                    </span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {brl(r.revenue)}{" "}
                      <span className="text-slate-400 font-normal">({num(pct, 1)}%)</span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(1, (r.revenue / maxRev) * 100)}%`,
                        background: CHANNEL_COLOR[r.channel],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Como ler: a origem do lead vem dos campos utm_* e vidorigem gravados pela
        landing page e importados do Mailchimp. “MQL” é o lead que virou quente e
        foi atribuído a um vendedor — então a taxa de MQL mostra qual origem traz
        gente que realmente avança, não só volume. Quanto maior o “% com rastreio”,
        mais confiável fica a leitura; o que não tem UTM fica de fora dos rankings.
      </p>
    </div>
  );
}

function OriginListCard({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: OriginRow[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return (
    <Card title={title}>
      <p className="mb-3 text-xs text-slate-400">{hint}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Sem dados rastreados no período.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex justify-between items-baseline gap-2 text-sm mb-1">
                <span className="min-w-0 truncate text-slate-700" title={r.key}>
                  {r.key}
                </span>
                <span className="shrink-0 tabular-nums text-slate-900">
                  <span className="font-semibold">{num(r.leads)}</span>
                  <span className="text-slate-400 font-normal"> · </span>
                  <span
                    className={`font-semibold ${
                      r.rate >= 0.15 ? "text-emerald-600" : "text-slate-500"
                    }`}
                  >
                    {num(r.rate * 100, 0)}% MQL
                  </span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-rose-400"
                  style={{ width: `${Math.max(2, (r.leads / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// vidorigem geralmente é o id de 11 caracteres de um vídeo do YouTube. Quando
// for, vira um card com thumbnail clicável (abre o vídeo) — bem mais útil que
// um código solto. Quando não for (ex.: "yt_podcast_nataliatendeiro"), cai pra
// um link de busca no YouTube.
function isYtId(s: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(s);
}

function VideoOriginCard({ rows }: { rows: OriginRow[] }) {
  return (
    <Card title="Vídeo de origem (vidorigem)">
      <p className="mb-3 text-xs text-slate-400">
        O vídeo do YouTube que trouxe o lead. Clique pra abrir e ver qual é.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Sem vídeo rastreado no período.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const yt = isYtId(r.key);
            const href = yt
              ? `https://youtu.be/${r.key}`
              : `https://www.youtube.com/results?search_query=${encodeURIComponent(r.key)}`;
            return (
              <li key={r.key}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 rounded-lg p-1.5 hover:bg-slate-50"
                >
                  {yt ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://i.ytimg.com/vi/${r.key}/mqdefault.jpg`}
                      alt=""
                      loading="lazy"
                      className="h-12 w-20 shrink-0 rounded-md object-cover bg-slate-100"
                    />
                  ) : (
                    <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-slate-100 text-lg">
                      ▶
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-700 group-hover:text-rose-600">
                      {r.key}
                    </span>
                    <span className="text-xs tabular-nums text-slate-500">
                      <span className="font-semibold text-slate-700">{num(r.leads)}</span> leads
                      <span className="text-slate-300"> · </span>
                      <span
                        className={r.rate >= 0.15 ? "font-semibold text-emerald-600" : "text-slate-500"}
                      >
                        {num(r.rate * 100, 0)}% MQL
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-slate-300 group-hover:text-rose-500">↗</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
