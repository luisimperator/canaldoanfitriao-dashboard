// Fluxo de tags do time de vendas (fonte única de verdade).
//
// As tags vêm do Mailchimp (members.tags) e são guardadas em leads.extra.tags.
// Algumas tags marcam o contato como "lista de espera" do time de vendas —
// leads que pedem atendimento ativo, diferentes da base fria/newsletter.
// A rota de sincronização (api/sync/mailchimp) usa isto para definir o status,
// e o dashboard usa para separar a lista de espera por motivo.

export interface SalesTeamBucket {
  key: string;
  label: string;
}

// Cada balde tem um rótulo amigável e os padrões de tag que caem nele.
const BUCKETS: { bucket: SalesTeamBucket; test: RegExp }[] = [
  {
    bucket: { key: "lista_de_espera", label: "Lista de espera" },
    test: /lista.?de.?espera/,
  },
  {
    bucket: { key: "gigantes", label: "Gigantes da Temporada" },
    // Tag do Mailchimp que marca a lista de espera do high-ticket "Gigantes da
    // Temporada" — basta conter "gigantes" (ex.: "Gigantes da Temporada",
    // "gigantes-super-interessados").
    test: /gigantes|super.?interess/,
  },
  {
    bucket: { key: "precisa_ajuda", label: "Precisa de ajuda" },
    test: /precisa.*ajuda/,
  },
];

// Classifica UMA tag num balde do time de vendas, ou null se for tag comum
// (base / newsletter / segmentações sem relação com o atendimento ativo).
export function salesTeamBucket(tag: string): SalesTeamBucket | null {
  const t = tag.toLowerCase();
  for (const { bucket, test } of BUCKETS) {
    if (test.test(t)) return bucket;
  }
  return null;
}

// true quando alguma tag joga o lead para o workflow do time de vendas.
export function isSalesTeamTag(tag: string): boolean {
  return salesTeamBucket(tag) !== null;
}

// Lê leads.extra.tags e devolve o primeiro balde do time de vendas encontrado.
// Usado no dashboard para agrupar a lista de espera por motivo.
export function leadSalesTeamBucket(
  extra: Record<string, unknown> | null | undefined
): SalesTeamBucket | null {
  const tags = extra?.tags;
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const bucket = salesTeamBucket(tag);
    if (bucket) return bucket;
  }
  return null;
}
