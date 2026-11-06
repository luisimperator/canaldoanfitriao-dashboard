import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { lerConfig, lerPedidos, processarPedido, registrarEvento } from "@/lib/tmb-entrega";

// Simula um aviso da TMB (só admin), no formato do webhook "Vendas", e passa
// pela mesma regra do webhook de verdade. O pedido ganha o prefixo TESTE- e
// uma simulação nunca pede entrega de verdade (fica "simulado").
const STATUS: Record<string, string> = { pago: "Efetivado", cancelado: "Cancelado", reembolsado: "Estornado" };

export async function POST(req: NextRequest) {
  const access = await getAccess();
  if (!access.authed || !access.isAdmin) return NextResponse.json({ error: "Só admin." }, { status: 403 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  const cfg = await lerConfig(supabase);
  if (!cfg) return NextResponse.json({ error: "tmb_config ausente." }, { status: 501 });

  const b = (await req.json().catch(() => ({}))) as { email?: string; nome?: string; tipo?: string; pedido?: string };
  const email = (b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  const tipo = b.tipo && STATUS[b.tipo] ? b.tipo : "pago";
  const pedido = `TESTE-${(b.pedido ?? "").trim() || email.split("@")[0]}`;
  const payload = {
    simulacao: true,
    pedido,
    status_pedido: STATUS[tipo],
    cliente: (b.nome ?? "").trim() || "Simulação",
    email,
    titulo: "Black Friday Histórica 2026 (simulação)",
    valor_total: 8997,
  };
  await supabase.from("webhook_log").insert({ source: "tmb_painel", note: `simulação: ${STATUS[tipo]}`, body: { ...payload, por: access.email } });
  const resultados = [];
  for (const p of lerPedidos(payload)) {
    const eventoId = await registrarEvento(supabase, p, "simulacao");
    resultados.push(await processarPedido(supabase, cfg, p, { origem: "simulacao", eventoId, simulacao: true }));
  }
  const r = resultados[0];
  return NextResponse.json({ ok: true, mensagem: r ? `${r.status}: ${r.detalhe}` : "nada", resultados });
}
