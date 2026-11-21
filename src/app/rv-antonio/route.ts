import { RV_ANTONIO_DEPOIS, RV_ANTONIO_EXPIRA, rvAntonioHtml } from "@/lib/rv-antonio-lp";

// Ordem do dia do Rômulo Visita com o Antonio Carlos (sex 27/11/2026):
// link.canaldoanfitriao.com.br/rv-antonio (conteúdo em src/lib/rv-antonio-lp.ts).
// A partir de 04/12/2026 00h (Brasília) redireciona pro YouTube do Canal.

export const dynamic = "force-dynamic";

export function GET() {
  if (Date.now() >= RV_ANTONIO_EXPIRA) {
    return new Response(null, { status: 307, headers: { Location: RV_ANTONIO_DEPOIS, "Cache-Control": "no-store" } });
  }
  return new Response(rvAntonioHtml(), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=300" },
  });
}
