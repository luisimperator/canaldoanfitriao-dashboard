import { NextRequest } from "next/server";
import { servirLp } from "@/lib/imersao-lp-rota";

// LP de venda da Imersão A5E, versão curta:
// link.canaldoanfitriao.com.br/imersao-chuva-de-reservas-airbnb/curta
// (mesmo conteúdo-base, sem os blocos longos; lógica em src/lib/imersao-lp-rota.ts)

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return servirLp(req, "curta");
}
