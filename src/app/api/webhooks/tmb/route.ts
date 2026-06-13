import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Webhook da TMB (pagamentos: pix / boleto parcelado).
// Por enquanto é um "ouvido": registra TODO payload recebido em webhook_log
// (source='tmb') e responde 200. Quando a TMB começar a enviar eventos reais,
// inspecionamos o formato no log e construímos o parser de pagamentos
// previstos e inadimplentes — mesmo caminho usado para decifrar a Eduzz.
//
// Configure no painel da TMB:
//   https://SEU_DOMINIO/api/webhooks/tmb?key=TMB_WEBHOOK_KEY

export async function POST(req: NextRequest) {
  const expectedKey = process.env.TMB_WEBHOOK_KEY;
  if (!expectedKey) {
    return NextResponse.json(
      { error: "TMB_WEBHOOK_KEY não configurada no servidor." },
      { status: 501 }
    );
  }
  if (req.nextUrl.searchParams.get("key") !== expectedKey) {
    return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    await supabase.from("webhook_log").insert({
      source: "tmb",
      note: "corpo ausente ou JSON inválido",
    });
    return NextResponse.json({ ok: true, action: "ping" });
  }

  // Tenta extrair um rótulo de evento de campos comuns, só para facilitar a leitura do log.
  const b = body as Record<string, unknown>;
  const note =
    String(b.event ?? b.type ?? b.status ?? b.evento ?? "evento") || "evento";
  await supabase.from("webhook_log").insert({ source: "tmb", note, body });

  return NextResponse.json({ ok: true });
}
