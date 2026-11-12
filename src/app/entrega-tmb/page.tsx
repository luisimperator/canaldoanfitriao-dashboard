import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { lerConfig } from "@/lib/tmb-entrega";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { TmbBotao, TmbConfigForm, TmbSimular } from "@/components/TmbEntrega";

export const dynamic = "force-dynamic";

type Entrega = {
  pedido_id: string;
  email: string;
  nome: string | null;
  produto: string | null;
  valor: number | null;
  status: string;
  detalhe: string | null;
  pedido_status: string | null;
  parcela_paga: number | null;
  cancelado_em: string | null;
  bloqueado: boolean;
  entregue_em: string | null;
  confirmado_em: string | null;
  teste: boolean;
  criado_em: string;
  atualizado_em: string;
};

type Evento = {
  id: number;
  pedido_id: string | null;
  evento: string | null;
  email: string | null;
  status: string | null;
  origem: string;
  resultado: string | null;
  recebido_em: string;
};

const SELO: Record<string, { label: string; cls: string }> = {
  entregue: { label: "Entregue", cls: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30" },
  ja_tinha: { label: "Já tinha", cls: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30" },
  pendente: { label: "Entregar na Eduzz", cls: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30" },
  simulado: { label: "Simulado (teste)", cls: "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-zinc-100 border-violet-200 dark:border-zinc-300/30" },
  aguardando: { label: "Aguardando 1ª parcela", cls: "bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-white/10" },
  erro: { label: "Erro", cls: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30" },
};

function quando(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function brl(v: number | null): string {
  return v === null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Tabela({ linhas }: { linhas: Entrega[] }) {
  if (!linhas.length) {
    return <p className="text-sm text-slate-600 dark:text-zinc-400">Nenhum pedido ainda.</p>;
  }
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 dark:text-zinc-500">
            <th className="py-2 pr-3">Pedido</th>
            <th className="py-2 pr-3">Comprador</th>
            <th className="py-2 pr-3">TMB</th>
            <th className="py-2 pr-3">Entrega</th>
            <th className="py-2 pr-3">Atualizado</th>
            <th className="py-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const selo = SELO[l.status] ?? SELO.erro;
            const aberto = !["entregue", "ja_tinha"].includes(l.status);
            return (
              <tr key={l.pedido_id} className="border-t border-slate-100 dark:border-white/[0.06] align-top">
                <td className="py-2 pr-3 font-mono text-xs text-slate-600 dark:text-zinc-400">
                  {l.pedido_id}
                  <div className="text-[11px] text-slate-400 dark:text-zinc-500">{brl(l.valor)}</div>
                </td>
                <td className="py-2 pr-3">
                  <div className="font-medium text-slate-900 dark:text-zinc-100">{l.nome ?? "—"}</div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400">{l.email}</div>
                </td>
                <td className="py-2 pr-3 text-xs text-slate-600 dark:text-zinc-400">
                  {l.pedido_status ?? "—"}
                  {l.parcela_paga ? ` · parcela ${l.parcela_paga}` : ""}
                  {l.cancelado_em && (
                    <div className="mt-1 font-semibold text-rose-600 dark:text-rose-400">Cancelado/estornado {quando(l.cancelado_em)}</div>
                  )}
                </td>
                <td className="py-2 pr-3 max-w-[340px]">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold border ${selo.cls}`}>{selo.label}</span>
                  {l.bloqueado && (
                    <span className="ml-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold border bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30">
                      Bloqueado na Nutror
                    </span>
                  )}
                  {l.status === "entregue" && !l.confirmado_em && (
                    <span className="ml-1 text-[11px] text-amber-600 dark:text-amber-400">sem matrícula ainda</span>
                  )}
                  <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{l.detalhe}</div>
                </td>
                <td className="py-2 pr-3 text-xs text-slate-400 dark:text-zinc-500 whitespace-nowrap">{quando(l.atualizado_em)}</td>
                <td className="py-2">
                  {aberto ? (
                    <div className="flex flex-col items-start gap-1.5">
                      <TmbBotao leve path="/api/tmb/entregar" body={{ pedido_id: l.pedido_id, acao: "agora" }} label="Entregar agora" />
                      {(l.status === "pendente" || l.status === "simulado" || l.status === "erro") && (
                        <TmbBotao
                          leve
                          path="/api/tmb/entregar"
                          body={{ pedido_id: l.pedido_id, acao: "marcar" }}
                          label="Já entreguei na Eduzz"
                          confirmar={`Confirma que a Entrega Manual de ${l.email} já foi feita na Eduzz?`}
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-zinc-500">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function EntregaTmbPage() {
  const access = await getAccess();
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return (
      <div>
        <PageHeader title="Entrega TMB → Eduzz/Nutror" />
        <Card>Supabase não configurado.</Card>
      </div>
    );
  }
  const [cfg, entregasR, eventosR, avisosR] = await Promise.all([
    lerConfig(supabase),
    supabase
      .from("tmb_entregas")
      .select("pedido_id, email, nome, produto, valor, status, detalhe, pedido_status, parcela_paga, cancelado_em, bloqueado, entregue_em, confirmado_em, teste, criado_em, atualizado_em")
      .order("atualizado_em", { ascending: false })
      .limit(500),
    supabase
      .from("tmb_eventos")
      .select("id, pedido_id, evento, email, status, origem, resultado, recebido_em")
      .order("recebido_em", { ascending: false })
      .limit(40),
    supabase
      .from("webhook_log")
      .select("created_at, body")
      .eq("source", "tmb_painel")
      .eq("note", "aviso")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const todas = (entregasR.data ?? []) as Entrega[];
  const reais = todas.filter((l) => !l.teste);
  const testes = todas.filter((l) => l.teste);
  const eventos = (eventosR.data ?? []) as Evento[];
  const avisos = (avisosR.data ?? []) as { created_at: string; body: { texto?: string; envios?: { ok: boolean }[] } }[];
  const conta = (s: string) => reais.filter((l) => l.status === s).length;
  const cancelados = reais.filter((l) => l.cancelado_em).length;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "SEU_DOMINIO";
  const webhookUrl = `https://${host}/api/webhooks/tmb`;
  const chave = process.env.TMB_WEBHOOK_KEY ?? null;

  return (
    <div>
      <PageHeader
        title="Entrega TMB → Eduzz/Nutror"
        subtitle="Comprador da Black que paga a entrada na TMB recebe na Nutror o mesmo pacote de quem compra na Eduzz (produto 2914907)"
      />

      {cfg?.modo_teste && (
        <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <b>Modo teste ligado.</b> Os pedidos pagos sem o pacote ficam como &quot;Simulado&quot; e o aviso mostra o que seria feito. Nenhum pedido de entrega vai pro time.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <KpiCard label="Pedidos" value={String(reais.length)} />
        <KpiCard label="Entregues" value={String(conta("entregue"))} tone="good" />
        <KpiCard label="Já tinham" value={String(conta("ja_tinha"))} />
        <KpiCard label="Entregar na Eduzz" value={String(conta("pendente") + conta("simulado"))} tone={conta("pendente") ? "warn" : "neutral"} />
        <KpiCard label="Erros" value={String(conta("erro"))} tone={conta("erro") ? "bad" : "neutral"} />
        <KpiCard label="Cancelados" value={String(cancelados)} tone={cancelados ? "warn" : "neutral"} />
      </div>

      <Card title="Pedidos da Black na TMB" className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-zinc-400">
          <TmbBotao path="/api/sync/tmb-varredura" label="Rodar varredura" />
          <span>
            Última varredura: {quando(cfg?.ultima_varredura ?? null)}
            {cfg?.ultima_varredura_resumo ? ` — ${cfg.ultima_varredura_resumo}` : ""}
          </span>
        </div>
        <Tabela linhas={reais} />
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card title="Como funciona">
          <ol className="list-decimal pl-4 space-y-1.5 text-sm text-slate-600 dark:text-zinc-400">
            <li>A TMB avisa o painel quando a entrada é paga (&quot;Efetivado&quot;) e a cada parcela.</li>
            <li>O painel confere se o e-mail já tem o pacote &quot;{cfg?.pacote_nutror_titulo}&quot; na Nutror ou comprou a Black na Eduzz. Se tiver: &quot;Já tinha&quot;.</li>
            <li>
              Se não tiver, avisa o time pra fazer a <b>Entrega Manual</b> na Eduzz (produto {cfg?.eduzz_produto_id} → ⋯ → Entrega Manual → e-mail).
              A API oficial da Eduzz não tem esse recurso, só o painel dela.
            </li>
            <li>Quando a matrícula chega da Nutror, o pedido vira &quot;Entregue&quot; sozinho e o time é avisado.</li>
            <li>Cancelamento ou estorno na TMB: só registra e avisa. Ninguém é bloqueado automaticamente.</li>
            <li>Todo dia às 7h13 a varredura confere tudo de novo e cobra o que ainda está sem o pacote.</li>
          </ol>
        </Card>

        <Card title="Ligação com a TMB">
          <div className="space-y-2 text-sm text-slate-600 dark:text-zinc-400">
            <p>
              Na TMB: <b>Integrações → Webhook</b>, no produto da Black, nos webhooks <b>Vendas</b> e <b>Financeiro</b>:
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-xs bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded px-1.5 py-0.5">{webhookUrl}</code>
              <CopyButton text={webhookUrl} label="Copiar URL" />
            </div>
            <p>
              Cabeçalho: Chave <code className="text-xs">x-tmb-key</code>, Valor:{" "}
              {chave ? (access.isAdmin ? <CopyButton text={chave} label="Copiar valor" /> : <i>(só admin vê)</i>) : <b className="text-rose-600">TMB_WEBHOOK_KEY não configurada</b>}
            </p>
            <p>
              Varredura: usa a sincronização da API da TMB que já roda no Supabase (token no cofre), produto{" "}
              <code className="text-xs">{cfg?.tmb_produto_id ?? "?"}</code>, pedidos a partir de {cfg?.black_desde ?? "?"} (o produto é o mesmo da Black de 2025).
            </p>
          </div>
        </Card>
      </div>

      {access.isAdmin && cfg && (
        <Card title="Configuração" className="mb-4">
          <TmbConfigForm
            modoTeste={cfg.modo_teste}
            telefones={cfg.aviso_telefones ?? []}
            templateId={cfg.aviso_template_id}
            tmbProdutoId={cfg.tmb_produto_id}
            filtro={cfg.filtro_black}
          />
          {!(cfg.aviso_telefones ?? []).length && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              Sem telefones: os avisos ficam só aqui no painel. O WhatsApp oficial do Canal não manda em grupo, então coloque os números de quem deve receber.
            </p>
          )}
        </Card>
      )}

      {access.isAdmin && (
        <Card title="Simular aviso da TMB (teste)" className="mb-4">
          <p className="mb-2 text-xs text-slate-500 dark:text-zinc-400">
            Passa pela mesma regra do webhook. O pedido ganha o prefixo TESTE- e nunca pede entrega de verdade.
          </p>
          <TmbSimular />
          {testes.length > 0 && (
            <div className="mt-4">
              <Tabela linhas={testes} />
            </div>
          )}
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Últimos avisos enviados">
          {avisos.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-zinc-400">Nenhum aviso ainda.</p>
          ) : (
            <ul className="space-y-2">
              {avisos.map((a, i) => {
                const env = a.body?.envios ?? [];
                const ok = env.filter((e) => e.ok).length;
                return (
                  <li key={i} className="text-xs text-slate-600 dark:text-zinc-400 border-b border-slate-50 dark:border-white/[0.04] pb-2 last:border-0">
                    <span className="text-slate-400 dark:text-zinc-500">{quando(a.created_at)} · </span>
                    <span className="whitespace-pre-line">{a.body?.texto}</span>
                    <span className="ml-1 text-slate-400 dark:text-zinc-500">
                      {env.length ? `(WhatsApp: ${ok}/${env.length})` : "(só no painel)"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Últimos eventos recebidos da TMB">
          {eventos.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-zinc-400">Nenhum aviso da TMB chegou ainda.</p>
          ) : (
            <ul className="space-y-1.5">
              {eventos.map((e) => (
                <li key={e.id} className="text-xs text-slate-600 dark:text-zinc-400">
                  <span className="text-slate-400 dark:text-zinc-500">{quando(e.recebido_em)} · </span>
                  <span className="font-mono">{e.pedido_id ?? "?"}</span> · {e.status ?? e.evento ?? "?"} · {e.email ?? "sem e-mail"}
                  {e.origem !== "webhook" && <span className="ml-1 text-violet-600 dark:text-violet-400">[{e.origem}]</span>}
                  {e.resultado && <div className="pl-3 text-slate-400 dark:text-zinc-500">{e.resultado}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
