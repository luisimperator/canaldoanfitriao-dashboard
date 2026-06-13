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
// Baseado nas tags REAIS da audiência "Anfitrião 5 Estrelas" no Mailchimp.
// Lista de espera do time de vendas = Grupo 1 (qualquer tag de espera) +
// Grupo 2 (gigantes super interessados, escrito com typo no Mailchimp).
// Imersão Gigantes e coortes antigas ficam de fora (decisão do negócio).
const BUCKETS: { bucket: SalesTeamBucket; test: RegExp }[] = [
  {
    bucket: { key: "espera", label: "Lista de espera" },
    // Pega lista-de-espera, gigantes-espera, sad-espera-09-24, sad-07-23-espera,
    // a5e-lista-de-espera, espera-lancamentos, sad-espera, lista-espera.
    test: /espera/,
  },
  {
    bucket: { key: "super_interessados", label: "Gigantes super interessados" },
    // Tag "gigantes-superinteresasdos" (escrita com erro de digitação no
    // Mailchimp — "interesasdos") e variantes "super interessados". Exige
    // "super" + "interes" para nunca pegar aluno ("aluno-gigantes").
    test: /super.?interes/,
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
