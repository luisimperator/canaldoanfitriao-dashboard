import type { NextRequest } from "next/server";
import { entrar, mostrar } from "@/lib/roteiros/porta";
import { ROTEIRO_GIGANTES_HTML } from "@/lib/roteiros/paginas";

// Roteiro da call do Gigantes da Temporada (Fernando, 26/11: "adaptar o roteiro
// do A5E pra gigantes e pra Black"). Fora do login do painel, com a senha dos
// roteiros (ROTEIRO_SENHA na Vercel). Conteúdo em src/lib/roteiros/gigantes.html.
export const dynamic = "force-dynamic";

const CAMINHO = "/roteiro-sales-call-gigantes";

export function GET(request: NextRequest) {
  return mostrar(request, "Roteiro do Gigantes", CAMINHO, ROTEIRO_GIGANTES_HTML);
}

export function POST(request: NextRequest) {
  return entrar(request, CAMINHO);
}
