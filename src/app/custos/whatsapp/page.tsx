import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import { DateRangePicker } from "@/components/DateRangePicker";
import { GastoPorDiaChart } from "@/components/CustosWhatsApp";
import {
  CATEGORIAS,
  brl2,
  hojeSP,
  nomeCategoria,
  normalizar,
  pct,
  porCategoria,
  porConta,
  porDia,
  porOrigem,
  somarDias,
  usd,
  type PainelWa,
} from "@/lib/custos-whatsapp";

// Custo do WhatsApp (Fernando, 25/11: "tenho pouquíssima visibilidade de
// quanto estamos gastando de envios: API oficial de whatsapp e tal. Queria um
// painel disso também. Separado do tráfego"). O que a Meta cobra de cada
// número, por categoria e por modelo de mensagem (migração 0148).

export const dynamic = "force-dynamic";

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

const TH = "px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2";
const TD = "px-2 py-2 tabular-nums";

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

export default async function CustoWhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const hoje = hojeSP();
  const inicioMes = `${hoje.slice(0, 8)}01`;
  const de = sp.from && RE_DIA.test(sp.from) ? sp.from : inicioMes;
  const ate = sp.to && RE_DIA.test(sp.to) ? sp.to : hoje;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return (
      <div>
        <PageHeader title="Custo do WhatsApp" />
        <Card>Supabase não configurado.</Card>
      </div>
    );
  }

  const [periodoRes, recenteRes] = await Promise.all([
    supabase.rpc("painel_whatsapp_custos", { p_de: de, p_ate: ate }),
    supabase.rpc("painel_whatsapp_custos", { p_de: somarDias(hoje, -7), p_ate: hoje }),
  ]);
  if (periodoRes.error) {
    return (
      <div>
        <PageHeader title="Custo do WhatsApp" />
        <Card>Não deu pra ler os custos: {periodoRes.error.message}</Card>
      </div>
    );
  }
  const p: PainelWa = normalizar(periodoRes.data);
  const r: PainelWa = normalizar(recenteRes.data);

  const linhas = porDia(p.dias, de, ate);
  const total = linhas.reduce((s, l) => s + l.total, 0);
  const totalUsd = p.dias.reduce((s, d) => s + (p.contas.find((c) => c.waba_id === d.waba_id)?.moeda === "USD" ? d.custo : 0), 0);
  const cobradas = linhas.reduce((s, l) => s + l.mensagens, 0);
  const categorias = porCategoria(p.dias);
  const contas = porConta(p.dias, p.contas);
  const origens = porOrigem(p.modelos);
  const totalModelos = origens.reduce((s, o) => s + o.custo_brl, 0);
  const atendimento = categorias.find((c) => c.key === "SERVICE");

  const recentes = porDia(r.dias, somarDias(hoje, -7), hoje);
  const custoHoje = recentes.find((l) => l.dia === hoje)?.total ?? 0;
  const custoOntem = recentes.find((l) => l.dia === somarDias(hoje, -1))?.total ?? 0;
  const seteDias = recentes.filter((l) => l.dia < hoje);
  const media7 = seteDias.length ? seteDias.reduce((s, l) => s + l.total, 0) / seteDias.length : 0;

  const mesAtual = de === inicioMes && ate === hoje;
  const diasNoMes = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0).getDate();
  const diasRestantes = diasNoMes - Number(hoje.slice(8, 10));
  const projecao = total + media7 * diasRestantes;

  const erros = p.ultima_sync?.erros?.filter(Boolean) ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Custo do WhatsApp"
        subtitle="Quanto a Meta cobra pelos envios da API oficial, por número, tipo de mensagem e modelo. Separado do tráfego."
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-2">Período</span>
        <DateRangePicker placeholder="Este mês" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <KpiCard
          label="Gasto no período"
          value={brl2(total)}
          hint={`${usd(totalUsd)} · ${cobradas.toLocaleString("pt-BR")} mensagens cobradas`}
        />
        <KpiCard label="Hoje (até agora)" value={brl2(custoHoje)} hint={`ontem ${brl2(custoOntem)}`} />
        <KpiCard
          label="Ritmo dos últimos 7 dias"
          value={`${brl2(media7)}/dia`}
          hint={`≈ ${brl2(media7 * 30)} por mês`}
        />
        {mesAtual ? (
          <KpiCard label="Projeção do mês" value={brl2(projecao)} hint={`no ritmo de 7 dias, mais ${diasRestantes} dias`} />
        ) : (
          <KpiCard
            label="Custo médio por mensagem"
            value={cobradas > 0 ? brl2(total / cobradas) : "—"}
            hint="todas as categorias"
          />
        )}
      </div>

      <Card title="Gasto por dia" className="mb-4">
        <GastoPorDiaChart data={linhas} />
      </Card>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Quem gastou" className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className={TH}>Origem</th>
                  <th className={`${TH} text-right`}>Envios</th>
                  <th className={`${TH} text-right`}>Custo</th>
                  <th className={`${TH} text-right`}>Por envio</th>
                </tr>
              </thead>
              <tbody>
                {origens.map((o) => (
                  <tr key={o.origem} className="border-b border-line/60">
                    <td className="px-2 py-2 text-ink">
                      {o.origem}
                      <span className="ml-1 text-xs text-ink-2">· {pct(o.custo_brl, total)}</span>
                    </td>
                    <td className={`${TD} text-right`}>{o.enviados.toLocaleString("pt-BR")}</td>
                    <td className={`${TD} text-right font-medium text-ink`}>{brl2(o.custo_brl)}</td>
                    <td className={`${TD} text-right text-ink-2`}>{o.enviados > 0 ? brl2(o.custo_brl / o.enviados) : "—"}</td>
                  </tr>
                ))}
                {atendimento && atendimento.custo_brl > 0 && (
                  <tr className="border-b border-line/60">
                    <td className="px-2 py-2 text-ink">
                      Respostas na janela de 24 h (Téo e time)
                      <span className="ml-1 text-xs text-ink-2">· {pct(atendimento.custo_brl, total)}</span>
                    </td>
                    <td className={`${TD} text-right`}>{atendimento.mensagens.toLocaleString("pt-BR")}</td>
                    <td className={`${TD} text-right font-medium text-ink`}>{brl2(atendimento.custo_brl)}</td>
                    <td className={`${TD} text-right text-ink-2`}>
                      {atendimento.mensagens > 0 ? brl2(atendimento.custo_brl / atendimento.mensagens) : "—"}
                    </td>
                  </tr>
                )}
                {origens.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-6 text-center text-ink-2">
                      Sem envio de modelo no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-2">
            Por modelo de mensagem, somado pelo dia UTC (é como a Meta entrega); pode diferir uns centavos do total
            por dia. As respostas na janela não são modelo: vêm do total de atendimento.
          </p>
        </Card>

        <Card title="Por tipo de mensagem" className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className={TH}>Tipo</th>
                  <th className={`${TH} text-right`}>Cobradas</th>
                  <th className={`${TH} text-right`}>Custo</th>
                  <th className={`${TH} text-right`}>Cada</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map((c) => (
                  <tr key={c.key} className="border-b border-line/60">
                    <td className="whitespace-nowrap px-2 py-2 text-ink">
                      <span
                        className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] align-middle"
                        style={{ background: CATEGORIAS.find((x) => x.key === c.key)?.cor ?? "var(--ink-2)" }}
                      />
                      {c.nome}
                    </td>
                    <td className={`${TD} text-right`}>
                      {c.mensagens.toLocaleString("pt-BR")}
                      {c.gratis > 0 && (
                        <div className="text-[11px] text-ink-2">+{c.gratis.toLocaleString("pt-BR")} grátis</div>
                      )}
                    </td>
                    <td className={`${TD} text-right font-medium text-ink`}>{brl2(c.custo_brl)}</td>
                    <td className={`${TD} whitespace-nowrap text-right text-ink-2`}>
                      {c.mensagens > 0 ? brl2(c.custo_brl / c.mensagens) : "—"}
                      {c.mensagens > 0 && <div className="text-[11px]">{usd(c.custo / c.mensagens, 4)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-2">
            Marketing é a mensagem de oferta e convite (a mais cara). Utilidade é aviso de compra, lembrete e cobrança.
            Atendimento são as mensagens livres dentro da janela de 24 h depois que o lead escreve.
          </p>
        </Card>
      </div>

      <Card title="Por número" className="mb-4 min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Número</th>
                <th className={`${TH} text-right`}>Cobradas</th>
                {CATEGORIAS.map((c) => (
                  <th key={c.key} className={`${TH} text-right`}>
                    {c.nome}
                  </th>
                ))}
                <th className={`${TH} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((l) => (
                <tr key={l.conta.waba_id} className="border-b border-line/60">
                  <td className="px-2 py-2 text-ink">
                    {l.conta.nome ?? l.conta.waba_id}
                    <div className="text-xs text-ink-2">
                      {l.conta.numero ?? ""} · cobrado em {l.conta.moeda ?? "—"}
                    </div>
                  </td>
                  <td className={`${TD} text-right`}>{l.mensagens.toLocaleString("pt-BR")}</td>
                  {CATEGORIAS.map((c) => (
                    <td key={c.key} className={`${TD} text-right text-ink-2`}>
                      {l.porCategoria[c.key] > 0 ? brl2(l.porCategoria[c.key]) : "—"}
                    </td>
                  ))}
                  <td className={`${TD} text-right font-semibold text-ink`}>{brl2(l.total)}</td>
                </tr>
              ))}
              {contas.length === 0 && (
                <tr>
                  <td colSpan={CATEGORIAS.length + 3} className="px-2 py-6 text-center text-ink-2">
                    Sem custo no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Modelos que mais gastaram" className="mb-4 min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Modelo</th>
                <th className={TH}>Origem</th>
                <th className={`${TH} text-right`}>Enviados</th>
                <th className={`${TH} text-right`}>Lidos</th>
                <th className={`${TH} text-right`}>Cliques</th>
                <th className={`${TH} text-right`}>Custo</th>
                <th className={`${TH} text-right`}>Por envio</th>
              </tr>
            </thead>
            <tbody>
              {p.modelos
                .filter((m) => m.custo_brl > 0 || m.enviados > 0)
                .slice(0, 40)
                .map((m) => (
                  <tr key={m.template_id} className="border-b border-line/60">
                    <td className="px-2 py-2 text-ink">
                      <span className="font-mono text-[12px]">{m.nome}</span>
                      <div className="text-xs text-ink-2">{nomeCategoria(m.categoria)}</div>
                    </td>
                    <td className="px-2 py-2 text-ink-2">{m.origem}</td>
                    <td className={`${TD} text-right`}>{m.enviados.toLocaleString("pt-BR")}</td>
                    <td className={`${TD} text-right text-ink-2`}>{pct(m.lidos, m.entregues)}</td>
                    <td className={`${TD} text-right text-ink-2`}>{m.cliques > 0 ? m.cliques.toLocaleString("pt-BR") : "—"}</td>
                    <td className={`${TD} text-right font-medium text-ink`}>{brl2(m.custo_brl)}</td>
                    <td className={`${TD} text-right text-ink-2`}>{m.enviados > 0 ? brl2(m.custo_brl / m.enviados) : "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {totalModelos > 0 && (
          <p className="mt-3 text-xs text-ink-2">
            Lidos = % dos entregues que foram abertos. Cliques = toques no botão de link do modelo.
          </p>
        )}
      </Card>

      <p className="text-xs text-ink-2">
        Fonte: Meta (custo por número e por modelo), lido a cada 3 h. As contas em dólar foram convertidas pela PTAX de
        venda do dia
        {p.cambio_hoje ? ` (última: R$ ${p.cambio_hoje.venda.toFixed(4).replace(".", ",")} em ${p.cambio_hoje.dia.split("-").reverse().join("/")})` : ""}
        , sem IOF nem spread do cartão. Última leitura: {quando(p.ultima_sync?.em ?? p.atualizado_em)}.
        {erros.length > 0 && <span className="text-amber-600 dark:text-amber-400"> Erros na última leitura: {erros.join(" · ")}</span>}
      </p>
    </div>
  );
}
