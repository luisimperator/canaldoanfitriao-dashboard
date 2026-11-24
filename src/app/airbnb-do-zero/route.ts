import { airbnbDoZeroHtml } from "@/lib/airbnb-do-zero-lp";

// LP do Airbnb do Zero: link.canaldoanfitriao.com.br/airbnb-do-zero
// (conteúdo e link do botão em src/lib/airbnb-do-zero-lp.ts)

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(airbnbDoZeroHtml(), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=300" },
  });
}
