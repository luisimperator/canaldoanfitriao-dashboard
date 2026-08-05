import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runRaspagem } from "@/lib/asaas-raspagem";

// Raspagem do caixa: manda via Pix o saldo do Asaas pra conta do Inter,
// deixando o colchão (default R$ 100) pra tarifas. Roda 1× ao dia pelo cron do
// Supabase, às 19h40 BRT (migrações 0039 e 0040) — a janela da noite pega o dia
// inteiro de vendas já liquidado e ainda cai ANTES das 20h, quando entra o
// limite noturno de Pix. Miolo em src/lib/asaas-raspagem.ts.
//
// Fica sob /api/import porque é aí que o middleware libera chamada sem sessão
// (src/proxy.ts) — a autorização é a chave.
//
// Chave PRÓPRIA (asaas_raspagem_key no Vault), separada da chave do sync: quem
// só lê cobrança não deveria conseguir disparar saída de dinheiro.
//
// GET /api/import/asaas-raspagem?key=...

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const { data: esperado } = await admin.rpc("asaas_raspagem_key");
  const key = req.nextUrl.searchParams.get("key");
  if (!esperado || key !== esperado) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const r = await runRaspagem("cron");
  return NextResponse.json(r, { status: r.ok || r.pulou ? 200 : 500 });
}
