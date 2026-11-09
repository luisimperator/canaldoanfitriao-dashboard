import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notificarVenda } from "@/lib/push";
import { lerConfig, lerPedidos, processarPedido, registrarErro, registrarEvento, type Resultado } from "@/lib/tmb-entrega";

// Webhook da TMB (pedidos parcelados da Black Friday Histórica).
//
// Cadastre no painel da TMB (Integrações > Webhook), nos webhooks "Vendas" e
// "Financeiro" do produto da Black:
//   URL:   https://SEU_DOMINIO/api/webhooks/tmb
//   Chave: x-tmb-key      Valor: o mesmo de TMB_WEBHOOK_KEY
// (também aceita ?key=TMB_WEBHOOK_KEY na URL).
//
// Todo aviso é guardado (webhook_log + tmb_eventos) e passa pela regra de
// entrega em src/lib/tmb-entrega.ts. Responde 200 sempre que o aviso foi
// guardado, mesmo se a entrega der erro (o erro fica no painel e é avisado),
// pra TMB não reenviar em loop.
//
// Simulação (testes): { "simulacao": true, ... } — o pedido ganha o prefixo
// TESTE- e nunca pede entrega de verdade.

export const maxDuration = 60;

function autorizado(req: NextRequest, chave: string): boolean {
  if (req.nextUrl.searchParams.get("key") === chave) return true;
  if (req.headers.get("x-tmb-key") === chave) return true;
  return req.headers.get("authorization") === `Bearer ${chave}`;
}

export async function POST(req: NextRequest) {
  const chave = process.env.TMB_WEBHOOK_KEY;
  if (!chave) {
    return NextResponse.json({ error: "TMB_WEBHOOK_KEY não configurada no servidor." }, { status: 501 });
  }
  if (!autorizado(req, chave)) {
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
    await supabase.from("webhook_log").insert({ source: "tmb", note: "corpo ausente ou JSON inválido" });
    return NextResponse.json({ ok: true, action: "ping" });
  }

  const simulacao = Boolean(body && typeof body === "object" && !Array.isArray(body) && (body as { simulacao?: unknown }).simulacao === true);
  const pedidos = lerPedidos(body);
  const b = (Array.isArray(body) ? body[0] : body) as Record<string, unknown> | undefined;
  const dados = (b?.dados ?? b) as Record<string, unknown> | undefined;
  const note = String(b?.event ?? dados?.status_pedido ?? dados?.status_pagamento ?? b?.status ?? "evento");
  await supabase.from("webhook_log").insert({ source: "tmb", note: simulacao ? `simulação: ${note}` : note, body });

  // Aviso de venda nova no celular: pedido que virou "Efetivado" (1ª parcela
  // paga), uma vez por pedido. Simulação não avisa.
  if (!simulacao) {
    const efetivados = pedidos.filter((p) => p.pedidoId && (p.status ?? "").toLowerCase() === "efetivado");
    if (efetivados.length > 0) {
      after(async () => {
        for (const p of efetivados) {
          await notificarVenda({
            chave: `tmb:${p.pedidoId}`,
            plataforma: "TMB",
            valor: p.valor ?? 0,
            produto: p.produto ?? p.oferta ?? "Pedido TMB",
          });
        }
      });
    }
  }

  const cfg = await lerConfig(supabase);
  if (!cfg) {
    return NextResponse.json({ ok: true, action: "logged", aviso: "tmb_config ausente" });
  }

  const resultados: Resultado[] = [];
  for (const p of pedidos) {
    if (simulacao && p.pedidoId && !p.pedidoId.startsWith("TESTE-")) p.pedidoId = `TESTE-${p.pedidoId}`;
    const eventoId = await registrarEvento(supabase, p, simulacao ? "simulacao" : "webhook");
    try {
      resultados.push(await processarPedido(supabase, cfg, p, { origem: simulacao ? "simulacao" : "webhook", eventoId, simulacao }));
    } catch (e) {
      const detalhe = e instanceof Error ? e.message : "erro";
      if (eventoId) await supabase.from("tmb_eventos").update({ resultado: `erro: ${detalhe}`.slice(0, 500) }).eq("id", eventoId);
      await registrarErro(supabase, cfg, p, detalhe);
      resultados.push({ pedidoId: p.pedidoId, status: "erro", detalhe });
    }
  }
  return NextResponse.json({ ok: true, resultados });
}
