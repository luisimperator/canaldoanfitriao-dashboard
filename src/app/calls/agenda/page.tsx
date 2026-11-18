import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, PageHeader } from "@/components/ui";
import { PushButton } from "@/components/PushVendasButton";
import { AgendaInstalar } from "@/components/AgendaInstalar";
import { diaBR, inicioDoDia, lerCalls, primeiroNome, quandoBR, rotuloDia, somarDias, type CallPainel } from "@/lib/painel-calls";

// App "Agenda" (ícone azul): as calls de hoje e dos próximos dias e o botão
// que liga o aviso de call neste aparelho. O painel completo segue em /calls.

export const dynamic = "force-dynamic";

const DIAS = 7;

const SITUACAO: Record<string, string> = {
  aconteceu: "aconteceu",
  falta: "faltou",
  apuracao: "em apuração",
  sem_dado: "sem dado",
  cancelada: "cancelada",
};

export default async function AgendaPage() {
  const agora = new Date();
  const hoje = diaBR(agora);
  const amanha = somarDias(hoje, 1);
  const supabase = getSupabaseAdmin();
  const { data: rows } = supabase
    ? await supabase.rpc("painel_calls", { p_de: inicioDoDia(hoje), p_ate: inicioDoDia(somarDias(hoje, DIAS + 1)) })
    : { data: null };
  const calls = lerCalls(rows as Record<string, unknown>[] | null)
    .filter((c) => c.situacao !== "cancelada")
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const porDia = new Map<string, CallPainel[]>();
  for (const c of calls) {
    const d = diaBR(c.inicio);
    porDia.set(d, [...(porDia.get(d) ?? []), c]);
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Agenda" title="Calls marcadas" subtitle={`Hoje e os próximos ${DIAS} dias`} />
      <AgendaInstalar />
      <div className="mb-4">
        <PushButton canal="calls" grande />
      </div>
      {porDia.size === 0 ? (
        <Card>
          <p className="text-sm text-slate-400 dark:text-zinc-500">Nenhuma call agendada.</p>
        </Card>
      ) : (
        [...porDia.entries()].map(([dia, lista]) => (
          <Card
            key={dia}
            title={`${dia === hoje ? "Hoje" : dia === amanha ? "Amanhã" : ""}${dia === hoje || dia === amanha ? " · " : ""}${rotuloDia(dia)} · ${lista.length} ${lista.length === 1 ? "call" : "calls"}`}
            className="mb-3"
          >
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {lista.map((c) => {
                const passou = c.situacao !== "futura";
                return (
                  <li key={c.id} className={`flex items-baseline gap-3 py-2 ${passou ? "opacity-60" : ""}`}>
                    <span className="w-12 shrink-0 font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                      {quandoBR(c.inicio).split(" ")[2]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-zinc-200">{c.nome ?? "—"}</span>
                    <span className="shrink-0 text-xs text-slate-500 dark:text-zinc-400">
                      {primeiroNome(c.vendedor)}
                      {passou && SITUACAO[c.situacao] ? ` · ${SITUACAO[c.situacao]}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
      <p className="mt-4 text-center text-xs text-slate-400 dark:text-zinc-500">
        <Link href="/calls" className="underline">
          Painel Calls completo
        </Link>
      </p>
    </div>
  );
}
