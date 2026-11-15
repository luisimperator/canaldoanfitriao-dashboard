import type { SupabaseClient } from "@supabase/supabase-js";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js/max";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, PageHeader } from "@/components/ui";
import { MapaAlunos, type AlunoMapa } from "@/components/MapaAlunos";
import { DDD } from "@/lib/mapa/ddd";
import { ESTADOS } from "@/lib/mapa/brasil";

// Mapa dos alunos e ex-alunos: de onde vem cada comprador, só pelo nome.
// Localização pelo endereço da compra na TMB ou, na Eduzz (que só manda o
// telefone), pelo DDD; quem tem telefone de fora, pelo código do país. Lido
// ao vivo da função mapa_alunos2 (migração 0104): comprador novo aparece na
// hora, sem rodar nada. O telefone fica no servidor: pro navegador vai só o
// país.

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

// Código do país (DDI) → país, pros números que não validam por inteiro
// (ex.: +44 0 7735…). Onde o código é de vários países, o principal.
const PAIS_DO_CODIGO: Record<string, string> = {};
for (const c of getCountries()) {
  const cod = getCountryCallingCode(c);
  if (!PAIS_DO_CODIGO[cod]) PAIS_DO_CODIGO[cod] = c;
}
Object.assign(PAIS_DO_CODIGO, { "1": "US", "7": "RU", "39": "IT", "44": "GB", "47": "NO", "61": "AU", "212": "MA", "262": "RE", "290": "SH", "358": "FI", "590": "GP", "599": "CW" });

// País pelo telefone digitado na compra: "+351…", "00 49…", "00 21 351…"
// (com a operadora brasileira na frente) ou só os dígitos ("4366…").
function paisDoTelefone(bruto: string): string | null {
  const s = bruto.trim();
  const d = s.replace(/\D/g, "");
  if (!d || /^0+$/.test(d)) return null;
  const explicito = s.startsWith("+") || d.startsWith("00");
  const tentativas = s.startsWith("+") ? [d] : d.startsWith("00") ? [d.slice(2), d.slice(4)] : [d];
  for (const t of tentativas) {
    const p = parsePhoneNumberFromString("+" + t);
    if (p?.isValid()) return p.country ?? PAIS_DO_CODIGO[p.countryCallingCode] ?? null;
  }
  if (explicito) {
    const t = s.startsWith("+") ? d : d.slice(2);
    for (const n of [1, 2, 3]) {
      const c = PAIS_DO_CODIGO[t.slice(0, n)];
      if (c) return c;
    }
  }
  return null;
}

// O Supabase devolve no máximo 1.000 linhas por consulta: sem paginar, o mapa
// mostrava só os primeiros 1.000 compradores (237 alunos) dos ~8.900.
async function lerCompradores(supabase: SupabaseClient) {
  const lote = 1000;
  const todos: Record<string, unknown>[] = [];
  for (let de = 0; ; de += lote) {
    const { data, error } = await supabase
      .rpc("mapa_alunos2")
      .order("id")
      .range(de, de + lote - 1);
    if (error) return { data: todos, error };
    const linhas = (data ?? []) as Record<string, unknown>[];
    todos.push(...linhas);
    if (linhas.length < lote) return { data: todos, error: null };
  }
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
  const { data, error } = await lerCompradores(supabase);
  const hoje = new Date().getTime();
  const alunos: AlunoMapa[] = data.map((r) => {
    const ddd = (r.ddd as string | null) ?? null;
    const regiao = ddd && DDD[ddd] ? DDD[ddd] : null;
    const ufEndereco = typeof r.uf === "string" && UFS.has(r.uf) ? r.uf : null;
    const ultimaCurso = r.ultima_curso ? Date.parse(String(r.ultima_curso)) : null;
    // Fora do Brasil: país pelo telefone. Sem país e sem código internacional
    // (ex.: 045 233-4843) é número brasileiro errado, não exterior.
    const foneEx = ddd === "EX" && !ufEndereco ? String(r.fone_ex ?? "") : "";
    const paisFone = foneEx ? paisDoTelefone(foneEx) : null;
    const internacional = /^\s*(\+|00)/.test(foneEx);
    const exterior = Boolean(foneEx) && paisFone !== "BR" && (paisFone !== null || internacional);
    const uf = ufEndereco ?? regiao?.uf ?? null;
    return {
      id: String(r.id),
      nome: nomeBonito(r.nome as string | null),
      uf,
      ddd: regiao && (!ufEndereco || regiao.uf === ufEndereco) ? ddd : null,
      exterior,
      pais: exterior ? paisFone : uf || paisFone === "BR" ? "BR" : null,
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
