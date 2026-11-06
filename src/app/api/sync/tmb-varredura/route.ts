import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { lerConfig, varredura } from "@/lib/tmb-entrega";

// Varredura de segurança da entrega TMB → Eduzz/Nutror.
// GET: cron diário da Vercel (vercel.json). POST: botão "Rodar varredura" do
// painel (exige sessão, pelo proxy). Lista os pedidos pagos da Black na API da
// TMB (se o token estiver configurado) e confere de novo a matrícula de todo
// pedido que ainda não fechou.

export const maxDuration = 300;

async function rodar() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  const cfg = await lerConfig(supabase);
  if (!cfg) return NextResponse.json({ error: "tmb_config ausente." }, { status: 501 });
  const { resumo } = await varredura(supabase, cfg);
  return NextResponse.json({ ok: true, mensagem: resumo });
}

export async function GET() {
  return rodar();
}

export async function POST() {
  return rodar();
}
