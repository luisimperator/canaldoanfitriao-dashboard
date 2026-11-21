import { rvOrdemResposta } from "@/lib/rv-ordem-lp";
import { RV_PEDRO } from "@/lib/rv-pedro-lp";

// Ordem do dia do Rômulo Visita (conteúdo em src/lib/rv-pedro-lp.ts):
// link.canaldoanfitriao.com.br/internos/rv-pedro. Uma semana depois da gravação
// redireciona pro YouTube do Canal.

export const dynamic = "force-dynamic";

export function GET() {
  return rvOrdemResposta(RV_PEDRO);
}
