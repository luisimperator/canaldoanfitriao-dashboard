import { NextRequest } from "next/server";
import { servirLp } from "@/lib/imersao-lp-rota";

// LP da Imersão A5E pra quem comprou o kit de adesivos (QR impresso no kit):
// link.canaldoanfitriao.com.br/imersao-chuva-de-reservas-airbnb/adesivos
// O QR aponta pra um link rastreado em Links & QR
// (link.canaldoanfitriao.com.br/imersao-chuva-de-reserva-airbnb-bonus-adesivos),
// que redireciona pra cá com as UTMs. Mesma LP longa, com o preço do presente;
// lógica em src/lib/imersao-lp-rota.ts.

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return servirLp(req, "adesivos");
}
