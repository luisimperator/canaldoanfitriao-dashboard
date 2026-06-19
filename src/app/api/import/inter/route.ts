import { NextRequest, NextResponse } from "next/server";
import { runInterSync } from "@/lib/integrations/inter-sync";

// Entrada de sincronização automática do extrato do Banco Inter, chamada por um
// cron (pg_cron no Supabase). Fica sob o prefixo /api/import, que o middleware
// (src/proxy.ts) libera sem login — por isso validamos a própria chave aqui,
// como os webhooks fazem. Defina INTER_SYNC_KEY no ambiente e chame:
//   POST /api/import/inter?key=INTER_SYNC_KEY
// Aceita também ?dataInicio/?dataFim (padrão: últimos 30 dias).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const expected = process.env.INTER_SYNC_KEY;
  const provided = req.nextUrl.searchParams.get("key");
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const { status, body } = await runInterSync({
    dataInicio: params.get("dataInicio"),
    dataFim: params.get("dataFim"),
  });
  return NextResponse.json(body, { status });
}
