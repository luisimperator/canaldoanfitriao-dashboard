import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { pushParaEndpoint, pushPublicKey } from "@/lib/push";

// Assinatura do aviso de venda nova (sino no menu).
// GET    — chave pública VAPID pro navegador assinar.
// POST   — guarda a assinatura deste aparelho e manda um aviso de teste.
// DELETE — desativa este aparelho.
// Só quem vê a aba de Vendas pode assinar: o aviso traz valor de venda.

async function podeAssinar() {
  const access = await getAccess();
  return access.authed && (access.isAdmin || access.tabs.includes("/vendas")) ? access : null;
}

export async function GET() {
  if (!(await podeAssinar())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const publicKey = await pushPublicKey();
  if (!publicKey) return NextResponse.json({ error: "Push não configurado no servidor." }, { status: 501 });
  return NextResponse.json({ publicKey });
}

export async function POST(req: NextRequest) {
  const access = await podeAssinar();
  if (!access) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const sub = (await req.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 400 });
  }
  const { error } = await admin.from("push_assinaturas").upsert(
    {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      email: access.email,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enviados = await pushParaEndpoint(sub.endpoint, {
    title: "🔔 Avisos de venda ativados",
    body: "A cada venda nova na Eduzz ou na TMB, chega um aviso aqui.",
    url: "/vendas",
    tag: "push-teste",
  });
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
