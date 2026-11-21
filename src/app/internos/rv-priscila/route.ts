import { rvOrdemResposta } from "@/lib/rv-ordem-lp";
import { RV_PRISCILA } from "@/lib/rv-priscila-lp";

// Ordem do dia do Rômulo Visita (conteúdo em src/lib/rv-priscila-lp.ts):
// link.canaldoanfitriao.com.br/internos/rv-priscila. Uma semana depois da gravação
// redireciona pro YouTube do Canal.

export const dynamic = "force-dynamic";

export function GET() {
  return rvOrdemResposta(RV_PRISCILA);
}
