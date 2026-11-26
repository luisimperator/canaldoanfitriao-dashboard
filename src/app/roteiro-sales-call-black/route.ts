import type { NextRequest } from "next/server";
import { entrar, mostrar } from "@/lib/roteiros/porta";
import { ROTEIRO_BLACK_HTML } from "@/lib/roteiros/paginas";

// Roteiro da call da Black Friday Histórica (Fernando, 26/11: "adaptar o roteiro
// do A5E pra gigantes e pra Black"). Fora do login do painel, com a senha dos
// roteiros (ROTEIRO_SENHA na Vercel). Conteúdo em src/lib/roteiros/black.html.
export const dynamic = "force-dynamic";

const CAMINHO = "/roteiro-sales-call-black";

export function GET(request: NextRequest) {
  return mostrar(request, "Roteiro da Black", CAMINHO, ROTEIRO_BLACK_HTML);
}

export function POST(request: NextRequest) {
  return entrar(request, CAMINHO);
}
