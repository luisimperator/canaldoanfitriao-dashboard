import { rvProximasResposta } from "@/lib/rv-proximas-lp";

// Rômulo Visita: próximas gravações, um card por convidado levando pra Ordem do dia.
// link.canaldoanfitriao.com.br/internos/rv-proximas (conteúdo em src/lib/rv-proximas-lp.ts).
// Gravação já passada sai da lista sozinha (meia-noite de Brasília do dia seguinte).

export const dynamic = "force-dynamic";

export function GET() {
  return rvProximasResposta();
}
