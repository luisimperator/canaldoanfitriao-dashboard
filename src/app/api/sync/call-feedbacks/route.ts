import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { feedbacksDoVendedor } from "@/lib/calls-feedback-vendedor";

// Feedback detalhado de cada call pro vendedor (src/lib/calls-feedback-vendedor.ts):
// de 5 em 5 min (vercel.json) gera o das calls cuja transcrição chegou e guarda
// em call_feedbacks, pro OpenClaw mandar no privado do vendedor
// (/api/openclaw/feedbacks). A transcrição chega pelo /api/sync/calls (:07 e :37).
// A autorização fica no proxy (src/proxy.ts) para todo /api/sync.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cada feedback leva 1-2 min no Claude: só começa um novo até 200 s de rodada.
const ATE_MS = 200_000;

async function rodar() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  const inicio = Date.now();
  const feitos = await feedbacksDoVendedor(supabase, inicio, ATE_MS, async (note, body) => {
    await supabase.from("webhook_log").insert({ source: "calls", note, body });
  });
  return NextResponse.json({ ok: true, feitos, ms: Date.now() - inicio });
}

// GET: cron da Vercel. POST: disparo manual, já logado.
export async function GET() {
  return rodar();
}

export async function POST() {
  return rodar();
}
