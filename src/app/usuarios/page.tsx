import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { TABS } from "@/lib/access";
import { Card, PageHeader } from "@/components/ui";
import { UsersManager, type UserRow } from "./UsersManager";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const access = await getAccess();
  if (!access.isAdmin) {
    return (
      <div>
        <PageHeader title="Usuários" subtitle="Gestão de acesso" />
        <Card>
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Esta área é restrita a administradores.
          </p>
        </Card>
      </div>
    );
  }

  const admin = getSupabaseAdmin();
  let users: UserRow[] = [];
  if (admin) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const { data: accessRows } = await admin.from("app_access").select("user_id, is_admin, tabs");
    const accMap = new Map((accessRows ?? []).map((r) => [r.user_id as string, r]));
    users = (list?.users ?? []).map((u) => {
      const a = accMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "—",
        isAdmin: (a?.is_admin as boolean) ?? false,
        tabs: (a?.tabs as string[]) ?? [],
        createdAt: u.created_at ?? null,
      };
    });
    users.sort((a, b) => a.email.localeCompare(b.email));
  }

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Crie acessos, redefina senhas e escolha quais abas cada pessoa enxerga"
      />
      <UsersManager initialUsers={users} allTabs={TABS} currentEmail={access.email} />
    </div>
  );
}
