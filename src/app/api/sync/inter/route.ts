import { NextRequest, NextResponse } from "next/server";
import { runInterSync } from "@/lib/integrations/inter-sync";
import { getAccess } from "@/lib/supabase-server";
import { canAccess } from "@/lib/access";
import { isCronRequest } from "@/lib/secure-compare";

// Sincronização manual do extrato do Banco Inter (botão na tela de Integrações).
// Exige o bearer do cron (CRON_SECRET) OU sessão com a aba Integrações — o
// porteiro (src/proxy.ts) só garante que há sessão; a permissão é conferida
// aqui. Para a sincronização automática (sem sessão), o cron usa
// /api/import/inter, que valida uma chave própria.
//
// Por padrão importa os últimos 30 dias; aceita ?dataInicio=YYYY-MM-DD&dataFim=
// YYYY-MM-DD (limite de 90 dias da API). Dedup por external_id, então repetir é
// seguro. Detalhes do cliente mTLS em src/lib/integrations/inter.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function autorizado(req: NextRequest): Promise<boolean> {
  if (isCronRequest(req)) return true;
  const access = await getAccess();
  return access.authed && canAccess("/integracoes", access);
}

export async function POST(req: NextRequest) {
  if (!(await autorizado(req))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const params = req.nextUrl.searchParams;
  const { status, body } = await runInterSync({
    dataInicio: params.get("dataInicio"),
    dataFim: params.get("dataFim"),
  });
  return NextResponse.json(body, { status });
}
