import { rvOrdemResposta } from "@/lib/rv-ordem-lp";
import { RV_TIAGO } from "@/lib/rv-tiago-lp";

// Ordem do dia do Rômulo Visita (conteúdo em src/lib/rv-tiago-lp.ts):
// link.canaldoanfitriao.com.br/internos/rv-tiago. Uma semana depois da gravação
// redireciona pro YouTube do Canal.

export const dynamic = "force-dynamic";

export function GET() {
  return rvOrdemResposta(RV_TIAGO);
}
