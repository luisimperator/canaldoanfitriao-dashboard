import { NextRequest, NextResponse } from "next/server";
import { runInterSync } from "@/lib/integrations/inter-sync";

// Sincronização manual do extrato do Banco Inter (botão na tela de Integrações).
// Protegida por login pelo middleware (src/proxy.ts). Para a sincronização
// automática (sem sessão), o cron usa /api/import/inter, que valida uma chave.
//
// Por padrão importa os últimos 30 dias; aceita ?dataInicio=YYYY-MM-DD&dataFim=
// YYYY-MM-DD (limite de 90 dias da API). Dedup por external_id, então repetir é
// seguro. Detalhes do cliente mTLS em src/lib/integrations/inter.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const { status, body } = await runInterSync({
    dataInicio: params.get("dataInicio"),
    dataFim: params.get("dataFim"),
  });
  return NextResponse.json(body, { status });
}
