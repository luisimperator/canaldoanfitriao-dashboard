import { maxHtml } from "@/lib/max-lp";

// LP do Max (análise grátis no WhatsApp): painel.../max e link.../max.
// Conteúdo, número do Max e preço em src/lib/max-lp.ts.

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(maxHtml(), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=300" },
  });
}
