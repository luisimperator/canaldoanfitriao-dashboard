import type { NextRequest } from "next/server";
import { entrar, mostrar } from "@/lib/roteiros/porta";
import { ROTEIRO_NOVA_HTML } from "@/lib/roteiros/paginas";

// Roteiro novo da call (CLOSER). Fora do login do painel, com senha
// (ROTEIRO_SENHA na Vercel). Conteúdo em src/lib/roteiros/nova.html.
export const dynamic = "force-dynamic";

const CAMINHO = "/roteiro-sales-call-nova";

export function GET(request: NextRequest) {
  return mostrar(request, "Roteiro novo", CAMINHO, ROTEIRO_NOVA_HTML);
}

export function POST(request: NextRequest) {
  return entrar(request, CAMINHO);
}
