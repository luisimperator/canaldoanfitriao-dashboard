import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ALL_TAB_HREFS, canAccess, tabForPath } from "@/lib/access";

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
  // Webhooks e a rota de import validam as próprias chaves; demais syncs
  // exigem sessão (disparados pelo botão da página Integrações, já logado).
  if (pathname.startsWith("/api/webhooks") || pathname.startsWith("/api/import")) {
    return NextResponse.next();
  }
  // Cron da Vercel (vercel.json) chamando os syncs: chega por GET, SEM cookie
  // de sessão — sem esta exceção o porteiro redirecionava o cron pra /login e
  // o sync nunca rodava. Com CRON_SECRET definido na Vercel, exige o header
  // Authorization que ela envia; sem o secret, aceita pelo user-agent do cron.
  if (pathname.startsWith("/api/sync")) {
    const secret = process.env.CRON_SECRET;
    const auth = request.headers.get("authorization") ?? "";
    const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
    const fromCron = secret ? auth === `Bearer ${secret}` : ua.includes("vercel-cron");
    if (fromCron) return NextResponse.next();
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

  // Permissão por aba (só páginas; as rotas /api exigem apenas sessão).
  if (!pathname.startsWith("/api") && tabForPath(pathname) !== null) {
    const { data } = await supabase
      .from("app_access")
      .select("is_admin, tabs")
      .eq("user_id", user.id)
      .maybeSingle();
    const isAdmin = data?.is_admin ?? false;
    // Sem linha em app_access = acesso total (não trava ninguém sem querer).
    const tabs = data ? (isAdmin ? ALL_TAB_HREFS : ((data.tabs as string[]) ?? [])) : ALL_TAB_HREFS;
    if (!canAccess(pathname, { isAdmin, tabs })) {
      const dest = tabs[0] ?? "/login";
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
