// LP de vendas do Checklist Essencial (Eduzz 1664520). O HTML fica no bucket
// público do Supabase (pub/checklist-essencial/lp.txt, que o Storage só serve
// como texto); aqui ele sai como página. Atualizar = reenviar o lp.txt, sem deploy.
// Pixel da Meta (PageView) e repasse de utm_*/fbclid pro checkout estão no HTML.
const LP = "https://xajrfrqpdxxkoogcyodw.supabase.co/storage/v1/object/public/pub/checklist-essencial/lp.txt";

export const dynamic = "force-dynamic";

export async function GET() {
  // ?v= fura o cache do CDN do Storage.
  const r = await fetch(`${LP}?v=${Date.now()}`, { cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) {
    return new Response("Página indisponível agora. Recarregue a página.", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(await r.text(), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
