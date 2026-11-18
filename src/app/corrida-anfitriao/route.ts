import { corridaCheckout, corridaHtml } from "@/lib/corrida-lp";

// LP da corrida Corre Anfitrião: link.canaldoanfitriao.com.br/corrida-anfitriao
// (conteúdo e link do botão em src/lib/corrida-lp.ts)

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(corridaHtml(corridaCheckout()), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=300" },
  });
}
