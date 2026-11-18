import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { pushParaEndpoint, pushPublicKey, type CanalPush } from "@/lib/push";

// Assinatura dos avisos no celular.
// GET    — chave pública VAPID pro navegador assinar.
// POST   — guarda a assinatura deste aparelho e manda um aviso de teste.
//          canal "vendas" (sino no menu do painel) ou "calls" (app Agenda).
// DELETE — desativa este aparelho.
// Aviso de venda só pra quem vê a aba Vendas (traz valor de venda); aviso de
// call só pra quem vê o Painel Calls.

const ABA: Record<CanalPush, string> = { vendas: "/vendas", calls: "/calls" };

async function podeAssinar(canal?: CanalPush) {
  const access = await getAccess();
  if (!access.authed) return null;
  if (access.isAdmin) return access;
  const abas = canal ? [ABA[canal]] : Object.values(ABA);
  return abas.some((a) => access.tabs.includes(a)) ? access : null;
}

const TESTE: Record<CanalPush, { title: string; body: string; url: string }> = {
  vendas: {
    title: "🔔 Avisos de venda ativados",
    body: "A cada venda nova na Eduzz ou na TMB, chega um aviso aqui.",
    url: "/vendas",
  },
  calls: {
    title: "📞 Avisos de call ativados",
    body: "Cada call que o Téo marcar chega aqui, com dia e hora no título.",
    url: "/calls/agenda",
  },
};

export async function GET() {
  if (!(await podeAssinar())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const publicKey = await pushPublicKey();
  if (!publicKey) return NextResponse.json({ error: "Push não configurado no servidor." }, { status: 501 });
  return NextResponse.json({ publicKey });
}

export async function POST(req: NextRequest) {
  const sub = (await req.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    canal?: string;
  } | null;
  const canal: CanalPush = sub?.canal === "calls" ? "calls" : "vendas";
  const access = await podeAssinar(canal);
  if (!access) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 400 });
  }
  const { error } = await admin.from("push_assinaturas").upsert(
    {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      email: access.email,
      canal,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enviados = await pushParaEndpoint(sub.endpoint, { ...TESTE[canal], tag: "push-teste" });
  return NextResponse.json({ ok: true, teste: enviados > 0 });
}

export async function DELETE(req: NextRequest) {
  if (!(await podeAssinar())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "endpoint obrigatório." }, { status: 400 });
  await admin.from("push_assinaturas").delete().eq("endpoint", body.endpoint);
  return NextResponse.json({ ok: true });
}
