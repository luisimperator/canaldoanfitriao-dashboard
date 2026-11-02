import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { contatoDoAviso } from "@/lib/unnichat-evento";

// Webhook do Unnichat (CRM/atendimento).
// As automações do Unnichat (Requisição HTTP) chamam:
//   https://SEU_DOMINIO/api/webhooks/unnichat?key=UNNICHAT_WEBHOOK_KEY
// nos eventos: contato criado, mudança de etapa do pipeline, ganho/perdido.
//
// Esta rota SÓ RECEBE: grava o aviso em webhook_log (pendente = true, com a
// ?etapa= da URL) e responde na hora. Quem processa é a fila
// (/api/sync/unnichat-fila, a cada minuto — lib/unnichat-evento). Antes o
// processamento era aqui dentro: ~8 idas ao banco por aviso, uma delas
// chamando a API do Unnichat. No pico do lançamento de set/26 as conexões
// acabaram e ~1.360 avisos se perderam. Gravar uma linha aguenta o pico; a
// fila esvazia em ritmo controlado e tenta de novo o que falhar.

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const expectedKey = process.env.UNNICHAT_WEBHOOK_KEY;
  const gotKey = req.nextUrl.searchParams.get("key");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = null;
  let rawText = "";
  try {
    rawText = await req.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }

  const contactId = body ? contatoDoAviso(body) : "";
  const keyOk = Boolean(expectedKey) && gotKey === expectedKey;
  const vaiPraFila = keyOk && Boolean(body) && Boolean(contactId);

  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  // CAIXA-PRETA + FILA: registra TODA requisição recebida — inclusive com
  // chave inválida/ausente, para diagnosticar a conexão com o Unnichat. Só o
  // aviso válido entra na fila (pendente).
  const { error: logErr } = await supabase.from("webhook_log").insert({
    source: "unnichat",
    note: !expectedKey
      ? "server sem UNNICHAT_WEBHOOK_KEY"
      : !keyOk
        ? "chave inválida ou ausente"
        : contactId
          ? "evento"
          : "ping / sem contact_id",
    body: body ?? (rawText ? { _raw: rawText.slice(0, 2000) } : null),
    etapa: req.nextUrl.searchParams.get("etapa"),
    pendente: vaiPraFila,
  });

  if (!expectedKey) {
    return NextResponse.json(
      { error: "UNNICHAT_WEBHOOK_KEY não configurada no servidor." },
      { status: 501 }
    );
  }
  if (!keyOk) {
    return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  }
  if (!vaiPraFila) {
    return NextResponse.json({ ok: true, action: "ping" });
  }
  if (logErr) {
    // Não conseguiu nem guardar: devolve erro para o Unnichat registrar a falha.
    return NextResponse.json({ error: logErr.message }, { status: 503 });
  }
  return NextResponse.json({ ok: true, fila: true });
}
