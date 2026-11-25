import type { NextRequest } from "next/server";
import { maxIaHtml, mensagemMaxIa } from "@/lib/max-ia-lp";

// LP do Max pra tráfego frio ("A IA do anfitrião de Airbnb"): link.../max-ia.
// Conteúdo em src/lib/max-ia-lp.ts. A /max continua igual.

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const mensagem = mensagemMaxIa(req.nextUrl.searchParams.get("utm_content"));
  return new Response(maxIaHtml({ mensagem }), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=300" },
  });
}
