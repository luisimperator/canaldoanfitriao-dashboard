import type { NextRequest } from "next/server";
import { entrar, mostrar } from "@/lib/roteiros/porta";
import { ROTEIRO_ATUAL_HTML } from "@/lib/roteiros/paginas";

// Análise do roteiro que o time usa hoje. Fora do login do painel, com senha
// (ROTEIRO_SENHA na Vercel). Conteúdo em src/lib/roteiros/atual.html.
export const dynamic = "force-dynamic";

const CAMINHO = "/roteiro-sales-call-atual";

export function GET(request: NextRequest) {
  return mostrar(request, "Roteiro de hoje", CAMINHO, ROTEIRO_ATUAL_HTML);
}

export function POST(request: NextRequest) {
  return entrar(request, CAMINHO);
}
