import { NextRequest } from "next/server";
import { registrarEventoLp } from "@/lib/imersao-track";

// Contador próprio da LP da Imersão (sendBeacon): ver src/lib/imersao-track.ts.

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return registrarEventoLp(req, "lp_pv");
}
