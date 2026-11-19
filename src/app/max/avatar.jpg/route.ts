// Rosto do Max pra LP /max: o mesmo do deck (IMGS["max.jpg"] dentro do
// deck.txt, no storage público pub/deck-a5e/). Se o deck trocar a foto, a LP
// acompanha; se não achar a foto, devolve um avatar desenhado (o "M" coral).

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";

const RESERVA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><radialGradient id="g" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#ef5a73"/><stop offset="1" stop-color="#c92e49"/></radialGradient></defs><circle cx="60" cy="60" r="60" fill="url(#g)"/><text x="60" y="78" text-anchor="middle" font-family="Poppins,Arial,sans-serif" font-weight="700" font-size="54" fill="#fff">M</text></svg>`;

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (base) {
    try {
      const r = await fetch(`${base}/storage/v1/object/public/pub/deck-a5e/deck.txt`, { cache: "no-store" });
      if (r.ok) {
        const deck = await r.text();
        const m = deck.match(/"max\.jpg"\s*:\s*"data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)"/);
        if (m) {
          return new Response(Buffer.from(m[2], "base64"), {
            headers: { "Content-Type": m[1], "Cache-Control": CACHE },
          });
        }
      }
    } catch {
      // cai no avatar desenhado
    }
  }
  return new Response(RESERVA, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}
