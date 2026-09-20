import { Card, PageHeader } from "@/components/ui";
import { getAccess } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Tela de quem está logado mas ainda não tem linha em app_access (ou tem a
// linha sem nenhuma aba). O porteiro (src/proxy.ts) manda pra cá em vez de
// liberar tudo — acesso é fail-closed. O botão "Sair" fica na barra lateral.
export default async function SemAcessoPage() {
  const access = await getAccess();
  return (
    <div>
      <PageHeader title="Acesso não liberado" subtitle="Sua conta existe, mas ainda não tem nenhuma aba liberada" />
      <Card>
        <p className="text-sm text-slate-700 dark:text-zinc-300">
          {access.email ? (
            <>
              A conta <strong>{access.email}</strong> foi autenticada, mas nenhuma área do painel
              está liberada para ela.
            </>
          ) : (
            <>Sua conta foi autenticada, mas nenhuma área do painel está liberada para ela.</>
          )}
        </p>
        <p className="mt-3 text-sm text-slate-600 dark:text-zinc-400">
          Fale com um administrador do painel: ele libera as abas na tela <strong>Usuários</strong>.
          Depois disso, basta recarregar esta página.
        </p>
      </Card>
    </div>
  );
}
