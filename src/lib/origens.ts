// Dicionário de origens: cada "porta de entrada" de lead tem um par fixo de
// utm_source / utm_medium. O gerador de links (Links & QR) oferece só estas
// opções, pra ninguém digitar UTM à mão e a origem não virar sopa
// (fb_Facebook_Mobile_Feed, youtube-rv-letycia, palestra...). O classificador
// de canal (lib/channels) reconhece todos os pares daqui.

export interface Porta {
  id: string;
  grupo: string;
  label: string;
  source: string;
  medium: string;
  /** dica mostrada no formulário ao escolher esta porta */
  dica?: string;
  /** trecho pronto pra copiar e colar junto com a dica */
  copiar?: string;
}

export const PORTAS: Porta[] = [
  { id: "yt-qr", grupo: "YouTube", label: "QR code no vídeo", source: "youtube", medium: "qr" },
  { id: "yt-descricao", grupo: "YouTube", label: "Link na descrição", source: "youtube", medium: "descricao" },
  { id: "yt-comentario", grupo: "YouTube", label: "Comentário fixado", source: "youtube", medium: "comentario" },
  { id: "yt-card", grupo: "YouTube", label: "Card / tela final", source: "youtube", medium: "card" },
  { id: "podcast", grupo: "Podcast", label: "Descrição do episódio (Spotify etc.)", source: "podcast", medium: "descricao" },
  { id: "ig-bio", grupo: "Instagram", label: "Link na bio", source: "instagram", medium: "bio" },
  { id: "ig-story", grupo: "Instagram", label: "Figurinha de link no story", source: "instagram", medium: "story" },
  {
    id: "ig-dm",
    grupo: "Instagram",
    label: "DM / comentário (Unnichat)",
    source: "instagram",
    medium: "dm",
    dica: "Use este link na mensagem que a automação do Unnichat manda.",
  },
  {
    id: "meta-ads",
    grupo: "Anúncios",
    label: "Anúncio Meta (Facebook / Instagram)",
    source: "meta",
    medium: "paid_social",
    dica:
      "Pra anúncio, o melhor é colar os parâmetros direto no Gerenciador (campo Parâmetros de URL do anúncio): assim cada clique já traz a campanha, o conjunto e o anúncio.",
    copiar:
      "utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}",
  },
  {
    id: "google-ads",
    grupo: "Anúncios",
    label: "Anúncio Google",
    source: "google",
    medium: "cpc",
    dica:
      "Pra anúncio, o melhor é deixar a codificação automática (gclid) ligada no Google Ads e colar isto no Modelo de acompanhamento da conta:",
    copiar: "{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}",
  },
  { id: "email", grupo: "E-mail", label: "E-mail (Mailchimp)", source: "email", medium: "mailchimp" },
  { id: "wpp-grupo", grupo: "WhatsApp", label: "Grupo de WhatsApp", source: "whatsapp", medium: "grupo" },
  { id: "wpp-lista", grupo: "WhatsApp", label: "Lista de transmissão / broadcast", source: "whatsapp", medium: "broadcast" },
  {
    id: "vendedor",
    grupo: "Time de vendas",
    label: "Link de vendedor",
    source: "vendedor",
    medium: "link",
    dica: "Na campanha, coloque o nome do vendedor (ex.: breno).",
  },
  { id: "evento", grupo: "Presencial", label: "Evento / palestra (QR no slide)", source: "evento", medium: "qr" },
];

/** fontes de vídeo: só nelas o slug do link vira o vidorigem (vídeo de origem) */
export function ehFonteDeVideo(source: string | null | undefined): boolean {
  const s = (source ?? "").toLowerCase();
  return s === "youtube" || s === "podcast" || /^yt\b|youtube/.test(s);
}

export function portaDe(source: string | null | undefined, medium: string | null | undefined): Porta | null {
  const s = (source ?? "").toLowerCase().trim();
  const m = (medium ?? "").toLowerCase().trim();
  return PORTAS.find((p) => p.source === s && p.medium === m) ?? null;
}

/** normaliza um valor de UTM: minúsculas, sem acento, só [a-z0-9_-] */
export function normUtm(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}
