// Ferramenta do Checklist Essencial (área do comprador, Eduzz 1664520 entregue
// pela Nutror). O HTML fica no bucket público do Supabase
// (pub/checklist-essencial/app.txt, que o Storage só serve como texto); aqui ele
// sai como página. Atualizar = reenviar o app.txt, sem deploy. Fora do Google.
const APP = "https://xajrfrqpdxxkoogcyodw.supabase.co/storage/v1/object/public/pub/checklist-essencial/app.txt";

export const dynamic = "force-dynamic";

export async function GET() {
  // ?v= fura o cache do CDN do Storage.
  const r = await fetch(`${APP}?v=${Date.now()}`, { cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) {
    return new Response("Página indisponível agora. Recarregue a página.", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
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
