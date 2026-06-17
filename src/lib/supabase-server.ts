import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_TAB_HREFS, type Access } from "@/lib/access";

// Cliente Supabase no servidor, lendo a sessão dos cookies (componentes de
// servidor e route handlers). Diferente do supabase-admin (service role),
// este respeita o usuário logado e o RLS.
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Chamado de um Server Component (sem permissão de escrever cookie) —
          // o refresh de sessão é tratado pelo proxy. Pode ignorar.
        }
      },
    },
  });
}

// Permissões do usuário atual. Sem Supabase (modo demo) libera tudo.
// Linha ausente em app_access = acesso total (não trava ninguém sem querer).
export async function getAccess(): Promise<Access> {
  const sb = await getServerSupabase();
  if (!sb) return { email: null, isAdmin: false, tabs: ALL_TAB_HREFS, authed: false };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { email: null, isAdmin: false, tabs: [], authed: false };
  const { data } = await sb
    .from("app_access")
    .select("is_admin, tabs")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { email: user.email ?? null, isAdmin: false, tabs: ALL_TAB_HREFS, authed: true };
  const tabs = data.is_admin ? ALL_TAB_HREFS : ((data.tabs as string[]) ?? []);
  return { email: user.email ?? null, isAdmin: data.is_admin, tabs, authed: true };
}
