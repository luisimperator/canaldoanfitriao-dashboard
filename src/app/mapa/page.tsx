import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, PageHeader } from "@/components/ui";
import { MapaAlunos, type AlunoMapa } from "@/components/MapaAlunos";
import { DDD } from "@/lib/mapa/ddd";
import { ESTADOS } from "@/lib/mapa/brasil";

// Mapa dos alunos e ex-alunos: de onde vem cada comprador, só pelo nome.
// Localização pelo endereço da compra na TMB ou, na Eduzz (que só manda o
// telefone), pelo DDD. Lido ao vivo da função mapa_alunos (migração 0086):
// comprador novo aparece na hora, sem rodar nada.

export const dynamic = "force-dynamic";

const UFS = new Set(ESTADOS.map((e) => e.uf));
const MINUSCULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

function nomeBonito(n: string | null): string {
  const s = (n ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "Sem nome";
  return s
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

export default async function MapaPage() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return (
      <div>
        <PageHeader title="Mapa dos alunos" />
        <Card>
          <p className="text-sm text-slate-500 dark:text-zinc-400">Supabase não configurado.</p>
        </Card>
      </div>
    );
  }
  const { data, error } = await supabase.rpc("mapa_alunos");
  const hoje = new Date().getTime();
  const alunos: AlunoMapa[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const ddd = (r.ddd as string | null) ?? null;
    const regiao = ddd && DDD[ddd] ? DDD[ddd] : null;
    const ufEndereco = typeof r.uf === "string" && UFS.has(r.uf) ? r.uf : null;
    const ultimaCurso = r.ultima_curso ? Date.parse(String(r.ultima_curso)) : null;
    return {
      id: String(r.id),
      nome: nomeBonito(r.nome as string | null),
      uf: ufEndereco ?? regiao?.uf ?? null,
      ddd: regiao && (!ufEndereco || regiao.uf === ufEndereco) ? ddd : null,
      exterior: ddd === "EX" && !ufEndereco,
      cidade: (r.cidade as string | null) ?? null,
      curso: Boolean(r.curso),
      ativo: ultimaCurso !== null && hoje - ultimaCurso <= 365 * 86400_000,
      produtos: (r.produtos as string | null) ?? null,
    };
  });

  return (
    <div>
      <PageHeader
        title="Mapa dos alunos"
        subtitle="De onde são os alunos e ex-alunos, só pelo nome. Localização pelo endereço da compra (TMB) ou pelo DDD do telefone (Eduzz). Atualiza sozinho a cada compra."
      />
      {error ? (
        <Card>
          <p className="text-sm text-rose-600 dark:text-rose-400">Não consegui ler os alunos: {error.message}</p>
        </Card>
      ) : (
        <MapaAlunos alunos={alunos} />
      )}
    </div>
  );
}
