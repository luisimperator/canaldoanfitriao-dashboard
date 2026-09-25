import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ALL_TAB_HREFS, canAccess, tabForPath } from "@/lib/access";
import { hasValidBearer } from "@/lib/secure-compare";

// Porteiro do dashboard: sem login, redireciona tudo para /login.
// Webhooks e syncs ficam de fora (são chamados por serviços externos e
// validam suas próprias chaves). Sem Supabase configurado (modo demo), não há login.
export async function proxy(request: NextRequest) {
  // Subdomínio dos links curtos (link.canaldoanfitriao.com.br): tudo nele é
  // slug de QR. Serve o slug NA RAIZ (link.../<slug>, sem /r/) reescrevendo
  // internamente pra rota /r/[slug]. O painel, no subdomínio dele, fica intacto.
  const host = (request.headers.get("host") ?? "").split(":")[0];
  if (host.split(".")[0] === "link") {
    const p = request.nextUrl.pathname;
    if (p === "/" || p === "") {
      return NextResponse.redirect("https://canaldoanfitriao.com.br");
    }
    if (p.startsWith("/r/")) return NextResponse.next();
    const u = request.nextUrl.clone();
    u.pathname = `/r${p}`; // /<slug> -> /r/<slug>
    return NextResponse.rewrite(u);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  const { pathname } = request.nextUrl;
  // Webhooks validam as próprias chaves (Eduzz, Unnichat, TMB, Asaas, Meta).
  if (pathname.startsWith("/api/webhooks")) {
    return NextResponse.next();
  }
  // Rotas chamadas por cron, SEM cookie de sessão:
  //  - /api/sync/*   → cron da Vercel (vercel.json), que manda
  //                    `Authorization: Bearer CRON_SECRET`;
  //  - /api/import/* → crons do Supabase, que validam a própria chave dentro
  //                    de cada handler (header x-webhook-key ou ?key=).
  // Sem CRON_SECRET configurado, as duas famílias respondem 503: antes, sem o
  // secret, qualquer requisição com "vercel-cron" no user-agent passava pelo
  // porteiro — user-agent é escolhido por quem chama, então era porta aberta.
  if (pathname.startsWith("/api/sync") || pathname.startsWith("/api/import")) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "CRON_SECRET não configurado no servidor." },
        { status: 503 }
      );
    }
    if (pathname.startsWith("/api/import")) return NextResponse.next();
    // Bearer do cron bate? Passa. Senão, cai na exigência de sessão abaixo
    // (botão "Sincronizar agora" da página Integrações, já logado) — e o
    // handler ainda confere a permissão da aba.
    if (hasValidBearer(request, secret)) return NextResponse.next();
  }
  // Redirect curto dos QR codes/links: público (é escaneado por qualquer um,
  // antes de virar lead). Valida o slug por conta própria.
  if (pathname.startsWith("/r/")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rotas públicas: login e a tela de redefinir senha (acessada pelo link do
  // e-mail, antes de a sessão normal existir).
  const isLogin = pathname === "/login";
  const isReset = pathname === "/atualizar-senha";
  if (!user) {
    if (isLogin || isReset) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (isReset) return response;

  // Permissão por aba (só páginas; as rotas /api checam a permissão dentro
  // de cada handler, com getAccess() + canAccess()).
  const isSemAcesso = pathname === "/sem-acesso";
  if (!pathname.startsWith("/api") && (isSemAcesso || tabForPath(pathname) !== null)) {
    const { data } = await supabase
      .from("app_access")
      .select("is_admin, tabs")
      .eq("user_id", user.id)
      .maybeSingle();
    const isAdmin = data?.is_admin === true;
    // Sem linha em app_access = NENHUMA aba (fail-closed). Uma conta que
    // existe no Auth mas não foi liberada em /usuarios não entra em lugar
    // nenhum — antes ganhava acesso total, o que transformava qualquer conta
    // criada com credencial vazada em usuário pleno do painel.
    const tabs = isAdmin ? ALL_TAB_HREFS : (((data?.tabs as string[] | null) ?? []));
    const semAba = !isAdmin && tabs.length === 0;
    if (semAba) {
      // Logado mas sem nenhuma aba: cai na tela de "acesso não liberado".
      return isSemAcesso ? response : NextResponse.redirect(new URL("/sem-acesso", request.url));
    }
    if (isSemAcesso) {
      // Tem aba: a tela de sem-acesso não faz sentido — vai pra primeira aba.
      return NextResponse.redirect(new URL(isAdmin ? "/" : tabs[0], request.url));
    }
    if (!canAccess(pathname, { isAdmin, tabs })) {
      const dest = tabs[0];
      if (tabForPath(dest) !== tabForPath(pathname)) {
        return NextResponse.redirect(new URL(dest, request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
