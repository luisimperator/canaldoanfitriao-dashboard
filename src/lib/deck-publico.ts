// Decks de venda (Black, Gigantes): públicos, sem login. O HTML fica no bucket
// público do Supabase (pub/<pasta>/deck.txt, que o Storage só serve como
// texto); aqui ele sai como página. Atualizar = reenviar o deck.txt, sem deploy.
const BASE = "https://xajrfrqpdxxkoogcyodw.supabase.co/storage/v1/object/public/pub";

export async function servirDeck(pasta: "deck-black" | "deck-gigantes"): Promise<Response> {
  // ?v= fura o cache do CDN do Storage.
  const r = await fetch(`${BASE}/${pasta}/deck.txt?v=${Date.now()}`, { cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) {
    return new Response("Deck indisponível agora. Recarregue a página.", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(await r.text(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
