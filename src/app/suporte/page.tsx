import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { brl, num } from "@/lib/format";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import { getCustomer360 } from "@/lib/support";
import { HandoffsList, type HandoffRow } from "./HandoffsList";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

const STATUS_PT: Record<string, string> = {
  paid: "Paga",
  refunded: "Reembolsada",
  canceled: "Cancelada",
  expired: "Expirada",
  recovering: "Em recuperação",
  open: "Em aberto",
  waitingPayment: "Aguardando pagamento",
};

export default async function SuportePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const sp = await searchParams;
  const email = sp.email?.trim() ?? "";
  const lookup = email ? await getCustomer360(email) : null;

  const admin = getSupabaseAdmin();
  let handoffs: HandoffRow[] = [];
  let kbCount = 0;
  let abertos = 0;
  if (admin) {
    const [{ data: hs }, { count: kb }] = await Promise.all([
      admin
        .from("support_handoffs")
        .select("id,created_at,email,nome,telefone,motivo,resumo,status,responsavel")
        .neq("status", "resolvido")
        .order("created_at", { ascending: false })
        .limit(100),
      admin.from("support_kb").select("id", { count: "exact", head: true }),
    ]);
    handoffs = (hs ?? []) as HandoffRow[];
    kbCount = kb ?? 0;
    abertos = handoffs.filter((h) => h.status === "aberto").length;
  }

  return (
    <div>
      <PageHeader
        title="Suporte"
        subtitle="Atendimento pós-venda ao cliente. Consulte o cliente, acompanhe a fila de casos escalados e treine a IA."
      />

      <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <strong>Fases 1 e 2 no ar:</strong> consulta do cliente, fila de handoff,
        treinamento e o <Link href="/suporte/simulador" className="underline font-medium">cérebro
        de IA</Link> (responde × escala). Falta a Fase 3: ligar no WhatsApp pela
        Meta. A IA precisa da chave <code>ANTHROPIC_API_KEY</code> no servidor.
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-6">
        <KpiCard label="Na fila (abertos)" value={num(abertos)} tone={abertos > 0 ? "warn" : "neutral"} />
        <KpiCard label="Em andamento" value={num(handoffs.length - abertos)} />
        <KpiCard label="Blocos de treino" value={num(kbCount)} hint="base de conhecimento" />
      </div>

      {/* Consulta de cliente */}
      <Card title="Consultar cliente" className="mb-6">
        <form method="get" className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            name="email"
            defaultValue={email}
            placeholder="e-mail cadastrado na compra"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
          >
            Consultar
          </button>
        </form>

        {lookup && "error" in lookup && (
          <p className="mt-3 text-sm text-rose-600">{lookup.error}</p>
        )}

        {lookup && !("error" in lookup) && (
          <div className="mt-4">
            {!lookup.found ? (
              <p className="text-sm text-slate-600">{lookup.resumo}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      lookup.isCliente
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {lookup.isCliente ? "Cliente" : "Não é cliente"}
                  </span>
                  {lookup.assinatura && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        lookup.assinatura.ativa
                          ? "bg-sky-100 text-sky-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      Assinatura {lookup.assinatura.ativa ? "ativa" : "inativa"}
                    </span>
                  )}
                  {lookup.inadimplente && (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                      ⚠️ Inadimplente
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 mb-4">
                  <Field label="Nome" value={lookup.nome} />
                  <Field label="E-mail" value={lookup.email} />
                  <Field label="Telefone" value={lookup.telefone} />
                  <Field label="Documento" value={lookup.documento} />
                </div>

                <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {lookup.resumo}
                </p>

                {lookup.compras.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                          <th className="py-2 font-medium">Produto</th>
                          <th className="py-2 font-medium">Origem</th>
                          <th className="py-2 font-medium text-right">Valor</th>
                          <th className="py-2 font-medium">Status</th>
                          <th className="py-2 font-medium text-right">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lookup.compras.map((c, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0">
                            <td className="py-1.5 text-slate-700">
                              {c.produto ?? "—"}
                              {c.assinatura && (
                                <span className="ml-1.5 rounded bg-sky-50 px-1 text-[10px] font-medium text-sky-600">
                                  recorrente
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 text-slate-500">
                              {c.fonte === "eduzz" ? "Eduzz" : "TMB"}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-slate-600">
                              {c.valor != null ? brl(c.valor) : "—"}
                            </td>
                            <td className="py-1.5 text-slate-600">
                              {c.status ? STATUS_PT[c.status] ?? c.status : "—"}
                            </td>
                            <td className="py-1.5 text-right text-slate-500 tabular-nums whitespace-nowrap">
                              {fmtDate(c.data)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {lookup.parcelados.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Parcelados (TMB)
                    </h3>
                    {lookup.parcelados.map((p) => (
                      <div
                        key={p.pedidoId}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 mb-2"
                      >
                        <span className="font-medium text-slate-800">{p.produto ?? "Pedido"}</span> ·{" "}
                        {p.statusFinanceiro ?? "—"} · {p.parcelas ?? "?"}x de{" "}
                        {p.valorParcela != null ? brl(p.valorParcela) : "—"}
                        {p.melhorDiaPagamento != null && ` · vence dia ${p.melhorDiaPagamento}`}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      {/* Fila de handoff */}
      <Card
        title="Fila de atendimento (casos escalados)"
        className="mb-6"
      >
        <HandoffsList initial={handoffs} />
      </Card>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/suporte/simulador" className="font-semibold text-rose-600 hover:text-rose-500">
          → Simular atendimento da IA
        </Link>
        <Link href="/suporte/treinamento" className="font-semibold text-rose-600 hover:text-rose-500">
          → Treinar a IA (base de conhecimento)
        </Link>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-400">{label}:</span>
      <span className="text-slate-700 break-all">{value || "—"}</span>
    </div>
  );
}
