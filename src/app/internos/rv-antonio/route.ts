// Ordem do dia do Rômulo Visita com o Antonio Carlos (#RV043).
// O Antonio cancelou a gravação (22/11/2026): a rota redireciona direto pro índice
// das próximas gravações. O conteúdo antigo segue em src/lib/rv-antonio-lp.ts, sem uso.

export const dynamic = "force-dynamic";

const DESTINO = "https://link.canaldoanfitriao.com.br/internos/rv-proximas";

export function GET() {
  return new Response(null, { status: 307, headers: { Location: DESTINO, "Cache-Control": "no-store" } });
}
