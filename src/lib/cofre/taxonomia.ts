// Cofre de Cases: as etiquetas de cada case e o nome que aparece na tela.
// O vocabulário é fechado (a extração usa só estes valores) pra busca e filtro
// casarem. A ordem dos grupos é a ordem dos filtros na página: primeiro a
// objeção do lead, que é o que o vendedor mais procura no meio da call.

export interface CaseCofre {
  id: string;
  nome: string;
  quem: string | null;
  titulo: string;
  antes: string | null;
  depois: string | null;
  numeros: string[];
  citacao: string | null;
  aluno: string;
  cidade: string | null;
  uf: string | null;
  perfil: string[];
  imovel: string[];
  dores: string[];
  objecoes: string[];
  resultados: string[];
  forca: "A" | "B" | "C";
  como_usar: string | null;
  fonte: { tipo: "youtube" | "encontro"; titulo: string; url: string; data: string | null; arquivo?: string };
  trecho: { inicio: string; fim: string; texto: string };
  outros_trechos?: { inicio: string; fim: string; sobre: string }[];
}

export const GRUPOS = [
  {
    chave: "objecoes",
    titulo: "Objeção do lead",
    valores: {
      preco: "Preço",
      tempo: "Não tenho tempo",
      "ja-fiz-curso": "Já fiz curso",
      "sozinho-youtube": "Faço sozinho / YouTube",
      "imovel-longe": "Imóvel longe",
      "imovel-simples": "Imóvel simples",
      "momento-obra": "Momento / obra",
      "medo-de-errar": "Medo de errar",
      "conjuge-socio": "Cônjuge ou sócio",
      confianca: "Confiança",
      "sem-imovel": "Ainda não tenho imóvel",
    },
  },
  {
    chave: "perfil",
    titulo: "Perfil",
    valores: {
      iniciante: "Começou do zero",
      "um-imovel": "1 imóvel",
      "poucos-imoveis": "2 a 5 imóveis",
      gestor: "Gestor (6+)",
      sublocacao: "Sublocação",
      "casal-familia": "Casal / família",
      "clt-largou": "Largou o emprego",
      "50-mais": "50+ / aposentado",
      investidor: "Investidor",
      "mora-longe": "Mora longe do imóvel",
      "sem-dinheiro": "Começou com pouco dinheiro",
    },
  },
  {
    chave: "imovel",
    titulo: "Imóvel",
    valores: {
      praia: "Praia",
      "chale-campo": "Chalé / campo",
      capital: "Capital",
      interior: "Interior",
      "studio-compacto": "Studio / compacto",
      apartamento: "Apartamento",
      casa: "Casa",
      kitnet: "Kitnet",
      quarto: "Quarto",
      "predio-inteiro": "Prédio inteiro",
      tematico: "Temático / diferente",
      simples: "Imóvel simples",
    },
  },
  {
    chave: "dores",
    titulo: "Problema resolvido",
    valores: {
      "anuncio-fotos": "Anúncio e fotos",
      "algoritmo-ocupacao": "Algoritmo e ocupação",
      precificacao: "Precificação",
      avaliacoes: "Avaliações / 5 estrelas",
      "baixa-temporada": "Baixa temporada",
      "operacao-limpeza": "Operação e limpeza",
      "automacao-tempo": "Automação / tempo",
      "reforma-mobilia": "Reforma e mobília",
      "condominio-legislacao": "Condomínio e leis",
      "financeiro-imposto": "Financeiro e imposto",
      "escala-equipe": "Escala e equipe",
      "captar-imoveis": "Captar imóveis",
    },
  },
  {
    chave: "resultados",
    titulo: "Prova",
    valores: {
      faturamento: "Faturamento",
      ocupacao: "Ocupação",
      diaria: "Diária maior",
      "numero-de-imoveis": "Mais imóveis",
      "avaliacoes-superhost": "Notas / Superhost",
      liberdade: "Vive disso",
      "tempo-livre": "Tempo livre",
      "retorno-rapido": "Retorno rápido",
    },
  },
  {
    chave: "aluno",
    titulo: "Quem é",
    valores: {
      a5e: "Aluno A5E",
      gigantes: "Aluno Gigantes",
      aluno: "Aluno",
      romulo: "Rômulo",
      "nao-informado": "Anfitrião convidado",
    },
  },
] as const;

export const FORCA = {
  A: "Aluno com número",
  B: "História com número",
  C: "Menção",
} as const;

// Palavras que o vendedor digita e a etiqueta que elas querem dizer, pra busca
// achar "esposa" em "Cônjuge ou sócio" e "caro" em "Preço".
export const SINONIMOS: Record<string, string[]> = {
  caro: ["preco"],
  dinheiro: ["preco", "sem-dinheiro"],
  investimento: ["preco", "investidor"],
  esposa: ["conjuge-socio"],
  esposo: ["conjuge-socio"],
  marido: ["conjuge-socio"],
  mulher: ["conjuge-socio"],
  socio: ["conjuge-socio"],
  longe: ["imovel-longe", "mora-longe"],
  distancia: ["imovel-longe", "mora-longe"],
  remoto: ["imovel-longe", "mora-longe"],
  obra: ["momento-obra", "reforma-mobilia"],
  reforma: ["reforma-mobilia", "momento-obra"],
  litoral: ["praia"],
  serra: ["chale-campo"],
  sitio: ["chale-campo"],
  chacara: ["chale-campo"],
  campo: ["chale-campo"],
  studio: ["studio-compacto"],
  estudio: ["studio-compacto"],
  clt: ["clt-largou"],
  emprego: ["clt-largou"],
  aposentado: ["50-mais"],
  aposentada: ["50-mais"],
  idoso: ["50-mais"],
  casal: ["casal-familia"],
  familia: ["casal-familia"],
  zero: ["iniciante", "sem-imovel"],
  comecando: ["iniciante", "sem-imovel"],
  iniciante: ["iniciante"],
  preco: ["precificacao", "preco"],
  diaria: ["precificacao", "diaria"],
  algoritmo: ["algoritmo-ocupacao"],
  ocupacao: ["algoritmo-ocupacao", "ocupacao"],
  fotos: ["anuncio-fotos"],
  anuncio: ["anuncio-fotos"],
  limpeza: ["operacao-limpeza"],
  tempo: ["tempo", "automacao-tempo", "tempo-livre"],
  curso: ["ja-fiz-curso"],
  youtube: ["sozinho-youtube"],
  sozinho: ["sozinho-youtube"],
  medo: ["medo-de-errar"],
  golpe: ["confianca"],
  confianca: ["confianca"],
  simples: ["imovel-simples", "simples"],
  gestao: ["gestor", "escala-equipe"],
  terceiros: ["gestor", "captar-imoveis"],
  sublocar: ["sublocacao"],
  imposto: ["financeiro-imposto"],
  condominio: ["condominio-legislacao"],
};
