import { NextRequest, NextResponse } from "next/server";
import { repassarTodos } from "@/lib/imersao";

// Botões da LP dos adesivos: checkout da oferta de R$ 97 já com o cupom próprio
// dos adesivos (R$ 4,90). Leva todos os parâmetros da visita; o que faltar de
// UTM entra como origem "adesivos". O clique já é contado em /t/click.

export const dynamic = "force-dynamic";

const CHECKOUT = "https://chk.eduzz.com/akmedewy?cupom=ADESIVO7QXW";
const UTM_PADRAO = "utm_source=adesivos&utm_medium=qr&utm_campaign=kit-adesivos";

export function GET(req: NextRequest) {
  const visita = repassarTodos(req.nextUrl.searchParams, CHECKOUT, ["v"]);
  return NextResponse.redirect(repassarTodos(new URLSearchParams(UTM_PADRAO), visita), 302);
}
