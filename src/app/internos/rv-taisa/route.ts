import { rvOrdemResposta } from "@/lib/rv-ordem-lp";
import { RV_TAISA } from "@/lib/rv-taisa-lp";

// Ordem do dia do Rômulo Visita com a Taisa Sanitá (seg 23/11/2026):
// link.canaldoanfitriao.com.br/internos/rv-taisa (conteúdo em src/lib/rv-taisa-lp.ts).
// A partir de 30/11/2026 00h (Brasília) redireciona pro YouTube do Canal.

export const dynamic = "force-dynamic";

export function GET() {
  return rvOrdemResposta(RV_TAISA);
}
