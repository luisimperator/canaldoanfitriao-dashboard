import { NextRequest, NextResponse } from "next/server";
import { runInterSync } from "@/lib/integrations/inter-sync";
import { fetchInterPagamentosBruto, getInterCreds } from "@/lib/integrations/inter";

// Entrada de sincronização automática do extrato do Banco Inter, chamada por um
// cron (pg_cron no Supabase). Fica sob o prefixo /api/import, que o middleware
// (src/proxy.ts) libera sem login — por isso validamos a própria chave aqui,
// como os webhooks fazem. Defina INTER_SYNC_KEY no ambiente e chame:
//   POST /api/import/inter?key=INTER_SYNC_KEY
// Aceita também ?dataInicio/?dataFim (padrão: últimos 30 dias).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnóstico: mostra a resposta crua do endpoint de pagamentos do Inter, para
// conferir se boletos do DDA aparecem por lá (e com que status/data).
//   GET /api/import/inter?key=INTER_SYNC_KEY&dias=60&filtrarDataPor=VENCIMENTO
export async function GET(req: NextRequest) {
  const expected = process.env.INTER_SYNC_KEY;
  const provided = req.nextUrl.searchParams.get("key");
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const creds = getInterCreds();
  if (!creds) return NextResponse.json({ error: "credenciais do Inter ausentes" }, { status: 503 });

  const dias = Number(req.nextUrl.searchParams.get("dias") ?? 60);
  const filtro = (req.nextUrl.searchParams.get("filtrarDataPor") ?? "PAGAMENTO") as
    | "PAGAMENTO"
    | "VENCIMENTO"
    | "INCLUSAO";
  const hoje = new Date().toISOString().slice(0, 10);
  const fim = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

  try {
    const r = await fetchInterPagamentosBruto(creds, hoje, fim, filtro);
    return NextResponse.json({ janela: { de: hoje, ate: fim, filtro }, ...r });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

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
