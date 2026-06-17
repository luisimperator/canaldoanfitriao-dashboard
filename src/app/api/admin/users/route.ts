import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { ALL_TAB_HREFS } from "@/lib/access";

export const dynamic = "force-dynamic";

function cleanTabs(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((t): t is string => typeof t === "string" && ALL_TAB_HREFS.includes(t)))];
}

export async function POST(req: NextRequest) {
  // Só admin gerencia usuários.
  const access = await getAccess();
  if (!access.isAdmin) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  try {
    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const isAdmin = !!body.isAdmin;
      const tabs = cleanTabs(body.tabs);
      if (!email || !email.includes("@")) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
      if (password.length < 4) return NextResponse.json({ error: "Senha muito curta (mín. 4)." }, { status: 400 });
      if (!isAdmin && tabs.length === 0) return NextResponse.json({ error: "Escolha ao menos uma aba." }, { status: 400 });

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) {
        return NextResponse.json({ error: error?.message ?? "Falha ao criar usuário." }, { status: 400 });
      }
      const { error: accErr } = await admin.from("app_access").upsert({
        user_id: data.user.id,
        email,
        is_admin: isAdmin,
        tabs: isAdmin ? ALL_TAB_HREFS : tabs,
        updated_at: new Date().toISOString(),
      });
      if (accErr) return NextResponse.json({ error: accErr.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === "reset") {
      const userId = String(body.userId ?? "");
      const password = String(body.password ?? "");
      if (!userId) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
      if (password.length < 4) return NextResponse.json({ error: "Senha muito curta (mín. 4)." }, { status: 400 });
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === "update") {
      const userId = String(body.userId ?? "");
      const isAdmin = !!body.isAdmin;
      const tabs = cleanTabs(body.tabs);
      if (!userId) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
      if (!isAdmin && tabs.length === 0) return NextResponse.json({ error: "Escolha ao menos uma aba." }, { status: 400 });
      const { error } = await admin.from("app_access").update({
        is_admin: isAdmin,
        tabs: isAdmin ? ALL_TAB_HREFS : tabs,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      const userId = String(body.userId ?? "");
      if (!userId) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro." }, { status: 500 });
  }
}
