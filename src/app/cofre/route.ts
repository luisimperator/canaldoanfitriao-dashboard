import type { NextRequest } from "next/server";
import { entrar, mostrar } from "@/lib/roteiros/porta";
import { COFRE_HTML } from "@/lib/roteiros/paginas";
import { dadosDaPagina } from "@/lib/cofre/dados";

// Cofre de Cases: histórias reais de anfitriões e elogios ao Rômulo, tirados
// das transcrições do canal, com busca, filtros, play no trecho e chat. Fora
// do login do painel, com a senha dos roteiros (ROTEIRO_SENHA na Vercel).
// Página em src/lib/roteiros/cofre.html; cases em src/lib/cofre/cases.json.
export const dynamic = "force-dynamic";

const CAMINHO = "/cofre";
const HTML = COFRE_HTML.replace("__COFRE_DADOS__", () => dadosDaPagina());

export function GET(request: NextRequest) {
  return mostrar(request, "Cofre de Cases", CAMINHO, HTML);
}

export function POST(request: NextRequest) {
  return entrar(request, CAMINHO);
}
