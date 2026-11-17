import { NextRequest } from "next/server";
import { servirLp } from "@/lib/imersao-lp-rota";

// LP de venda da Imersão A5E, versão longa:
// link.canaldoanfitriao.com.br/imersao-chuva-de-reservas-airbnb
// (versão curta em ./curta; lógica em src/lib/imersao-lp-rota.ts)

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return servirLp(req, "longa");
}
