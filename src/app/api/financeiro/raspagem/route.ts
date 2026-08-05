import { NextResponse } from "next/server";
import { getAccess } from "@/lib/supabase-server";
import { canAccess } from "@/lib/access";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveSweepDestino, runRaspagem } from "@/lib/asaas-raspagem";

// Raspagem Asaas → Inter no braço (botão da Provisão de caixa) e status da
// última execução. O automático é o cron do Supabase em /api/import/asaas-raspagem.
//
// Move dinheiro: exige sessão E permissão da aba de Provisão — não basta estar
// logado no painel.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function autorizado() {
  const access = await getAccess();
  return access.authed && canAccess("/financeiro/provisao", access);
}

export async function GET() {
  if (!(await autorizado())) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data } = await admin
    .from("asaas_raspagens")
    .select("criada_em, trigger, ok, pulou, motivo, erro, valor, saldo, transfer_status")
    .order("criada_em", { ascending: false })
    .limit(5);

  return NextResponse.json({
    configurada: resolveSweepDestino() !== null,
    ultimas: data ?? [],
  });
}

export async function POST() {
  if (!(await autorizado())) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const r = await runRaspagem("manual");
  return NextResponse.json(r, { status: r.ok || r.pulou ? 200 : 500 });
}
