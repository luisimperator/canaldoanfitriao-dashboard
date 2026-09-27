import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Webhook da Tactiq (transcrições de reuniões dos vendedores).
//
// A Tactiq não dispara para uma URL arbitrária por conta própria: o caminho é
// Tactiq → Zapier (gatilho "Meeting Transcript Is Ready") → "Webhooks by
// Zapier" (POST) → esta rota. Configure o Zap apontando para:
//   https://SEU_DOMINIO/api/webhooks/tactiq?key=TACTIQ_WEBHOOK_KEY
//
// Por enquanto é um "ouvido" (caixa-preta): registra TODO payload recebido em
// webhook_log (source='tactiq') e responde 200. Assim que virmos o formato real
// que o Zapier manda, construímos a tabela definitiva (ex. seller_transcripts)
// e o parser — mesmo caminho usado para decifrar Eduzz/Unnichat/TMB.

export async function POST(req: NextRequest) {
  const expectedKey = process.env.TACTIQ_WEBHOOK_KEY;
  const gotKey = req.nextUrl.searchParams.get("key");

  const supabase = getSupabaseAdmin();

  // Lê o corpo cru (pings de validação podem vir vazios ou não-JSON).
  let body: unknown = null;
  let rawText = "";
  try {
    rawText = await req.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }

  const keyOk = Boolean(expectedKey) && gotKey === expectedKey;

  // CAIXA-PRETA: registra TODA requisição — inclusive com chave inválida — para
  // diagnosticar a conexão com o Zapier/Tactiq.
  if (supabase) {
    await supabase.from("webhook_log").insert({
      source: "tactiq",
      note: !expectedKey
        ? "server sem TACTIQ_WEBHOOK_KEY"
        : !keyOk
          ? "chave inválida ou ausente"
          : body
            ? "evento"
            : "ping / corpo vazio",
      body: body ?? (rawText ? { _raw: rawText.slice(0, 4000) } : null),
    });
  }

  if (!expectedKey) {
    return NextResponse.json(
      { error: "TACTIQ_WEBHOOK_KEY não configurada no servidor." },
      { status: 501 }
    );
  }
  if (!keyOk) {
    return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  }
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  return NextResponse.json({ ok: true });
}
