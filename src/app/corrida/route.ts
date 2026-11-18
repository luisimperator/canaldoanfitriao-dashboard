import { NextRequest, NextResponse } from "next/server";

// Atalho: /corrida -> /corrida-anfitriao (mantém utm_* e afins).
export function GET(req: NextRequest) {
  const u = req.nextUrl.clone();
  u.pathname = "/corrida-anfitriao";
  return NextResponse.redirect(u, 308);
}
