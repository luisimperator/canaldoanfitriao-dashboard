import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { entregar, lerConfig, linhaComoPedido, marcarEntregue, registrarErro } from "@/lib/tmb-entrega";

// Ações por pedido na tela Entrega TMB (exige sessão):
//   acao "agora":   roda a regra de entrega de novo (confere a matrícula e, se
//                   faltar, pede a Entrega Manual / mostra o que faria no modo teste)
//   acao "marcar":  o time já fez a Entrega Manual na Eduzz: marca entregue
//                   (a matrícula da Nutror confirma depois)
export async function POST(req: NextRequest) {
  const access = await getAccess();
  if (!access.authed) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  const cfg = await lerConfig(supabase);
  if (!cfg) return NextResponse.json({ error: "tmb_config ausente." }, { status: 501 });

  const { pedido_id, acao } = (await req.json().catch(() => ({}))) as { pedido_id?: string; acao?: string };
  if (!pedido_id) return NextResponse.json({ error: "pedido_id é obrigatório." }, { status: 400 });
  const por = access.email ?? "painel";

  if (acao === "marcar") {
    const r = await marcarEntregue(supabase, cfg, pedido_id, por);
    return NextResponse.json({ ok: true, mensagem: r.detalhe, resultado: r });
  }

  const p = await linhaComoPedido(supabase, pedido_id);
  if (!p) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  try {
    const r = await entregar(supabase, cfg, p, { origem: "painel", forcar: true, simulacao: pedido_id.startsWith("TESTE-") });
    return NextResponse.json({ ok: true, mensagem: `${r.status}: ${r.detalhe}`, resultado: r });
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : "erro";
    await registrarErro(supabase, cfg, p, detalhe);
    return NextResponse.json({ error: detalhe }, { status: 500 });
  }
}
