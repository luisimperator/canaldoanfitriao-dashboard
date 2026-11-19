import type { NextRequest } from "next/server";
import { maxHtml, mensagemMax } from "@/lib/max-lp";

// LP do Max (análise grátis no WhatsApp): painel.../max e link.../max.
// Conteúdo, número do Max e preço em src/lib/max-lp.ts. Com ?utm_source=...
// a mensagem pronta do WhatsApp diz de onde a pessoa veio (ex.: stories).

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const mensagem = mensagemMax(req.nextUrl.searchParams.get("utm_source"));
  return new Response(maxHtml({ mensagem }), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=300" },
  });
}
