import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isoToday } from "@/lib/metrics";
import { num } from "@/lib/format";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import { GRUPO_NOME, MovimentacaoGrupos, type GrupoChave } from "@/components/MovimentacaoGrupos";

export const dynamic = "force-dynamic";

// Contagens diárias gravadas pelo Foley (lê o WhatsApp dos grupos e atualiza
// a tabela todo dia 00h10, horário de São Paulo).
async function contagens(): Promise<{ porGrupo: Record<GrupoChave, Record<string, number>>; atualizado: string | null }> {
  const porGrupo: Record<GrupoChave, Record<string, number>> = { a5e: {}, gigantes: {} };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { porGrupo, atualizado: null };
  // O PostgREST corta em 1000 linhas por leitura e o histórico vem desde 2021:
  // lê em páginas até acabar.
  const PAGE = 1000;
  const linhas: unknown[] = [];
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await supabase
      .from("grupo_mensagens_diarias")
      .select("grupo, data, mensagens, atualizado_em")
      .order("data", { ascending: true })
      .order("grupo", { ascending: true })
      .range(de, de + PAGE - 1);
    if (error || !data) break;
    linhas.push(...data);
    if (data.length < PAGE) break;
  }
  let atualizado: string | null = null;
  for (const r of linhas as { grupo: string; data: string; mensagens: number; atualizado_em: string }[]) {
    if (r.grupo !== "a5e" && r.grupo !== "gigantes") continue;
    porGrupo[r.grupo][r.data] = Number(r.mensagens ?? 0);
    if (!atualizado || r.atualizado_em > atualizado) atualizado = r.atualizado_em;
  }
  return { porGrupo, atualizado };
}

function voltarDias(d: string, n: number): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

export default async function MovimentacaoGruposPage() {
  const hoje = isoToday();
  const ontem = voltarDias(hoje, 1);
  const { porGrupo, atualizado } = await contagens();
  const media = (g: GrupoChave, dias: number) => {
    let t = 0;
    for (let i = 1; i <= dias; i++) t += porGrupo[g][voltarDias(hoje, i)] ?? 0;
    return t / dias;
  };
  const semDados = Object.keys(porGrupo.a5e).length + Object.keys(porGrupo.gigantes).length === 0;
  const quando = atualizado
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(atualizado))
    : null;

  return (
    <div>
      <PageHeader
        eyebrow="Painel"
        title="Movimentação Grupos"
        subtitle={`Mensagens enviadas por dia nos grupos de membros do A5E e do Gigantes.${
          quando ? ` Atualizado em ${quando}.` : ""
        }`}
      />
      {semDados ? (
        <Card>
          <p className="text-sm text-slate-600 dark:text-zinc-400">Ainda sem contagem dos grupos.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
            {(["a5e", "gigantes"] as GrupoChave[]).map((g) => (
              <KpiCard
                key={`ontem-${g}`}
                label={`${g === "a5e" ? "A5E" : "Gigantes"} ontem`}
                value={num(porGrupo[g][ontem] ?? 0)}
                hint={GRUPO_NOME[g]}
              />
            ))}
            {(["a5e", "gigantes"] as GrupoChave[]).map((g) => (
              <KpiCard
                key={`media-${g}`}
                label={`${g === "a5e" ? "A5E" : "Gigantes"} média 30 dias`}
                value={num(media(g, 30), 0)}
                hint={`mensagens/dia · 7 dias: ${num(media(g, 7), 0)}`}
              />
            ))}
          </div>
          <MovimentacaoGrupos hoje={hoje} porGrupo={porGrupo} />
        </>
      )}
    </div>
  );
}
