import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ALL_TAB_HREFS, canAccess, tabForPath } from "@/lib/access";

// Porteiro do dashboard: sem login, redireciona tudo para /login.
// Webhooks e syncs ficam de fora (são chamados por serviços externos e
// validam suas próprias chaves). Sem Supabase configurado (modo demo), não há login.
// LP de venda da Imersão A5E (página, botão de comprar e as imagens dela em
// public/lp/): pública nos dois domínios.
const LP_IMERSAO = "/imersao-chuva-de-reservas-airbnb";
// /t/pv e /t/click: contador próprio da LP (sendBeacon), também público.
// /internos/ com dado sensível: exige o login do painel (e a aba liberada).
const INTERNOS_COM_LOGIN = ["/internos/assinaturas"];
function ehInternoComLogin(p: string): boolean {
  return INTERNOS_COM_LOGIN.some((x) => p === x || p.startsWith(x + "/"));
}
function ehLpPublica(p: string): boolean {
  return (
    p === LP_IMERSAO ||
    p.startsWith(LP_IMERSAO + "/") ||
    p.startsWith("/lp/") ||
    // LP da corrida (/corrida redireciona pra /corrida-anfitriao) e a marca que ela usa.
    p === "/corrida-anfitriao" || p === "/corrida" ||
    // LP do low ticket Airbnb do Zero.
    p === "/airbnb-do-zero" ||
    // Páginas internas (ex.: ordem do dia do Rômulo Visita). A aba
    // Assinaturas tem dado de aluno e fica atrás do login (ehInternoComLogin).
    (p.startsWith("/internos/") && !ehInternoComLogin(p)) ||
    // LP do Max (análise grátis no WhatsApp) e o rosto dele.
    p === "/max" || p.startsWith("/max/") ||
    // Variante da LP do Max pra tráfego frio.
    p === "/max-ia" ||
    p.startsWith("/marca/") ||
    p === "/icon-192.png" ||
    p === "/t/pv" ||
    p === "/t/click"
  );
}

// Páginas públicas trazidas do Replit, só no subdomínio de links.
const PAGINAS_REPLIT = ["curso-booking", "encontro-anfitrioes", "10mil-com-airbnb", "obrigado-10mil"];

export async function proxy(request: NextRequest) {
  // Subdomínio dos links curtos (link.canaldoanfitriao.com.br): só rotas
  // públicas de link. Os links fixos da Imersão (/imersao, /i/<codigo>, /vip) passam direto;
  // o resto é slug de QR, servido NA RAIZ (link.../<slug>, sem /r/) reescrevendo
  // internamente pra rota /r/[slug] — inclusive caminhos do painel, que aqui
  // não existem. O painel, no subdomínio dele, fica intacto.
  const host = (request.headers.get("host") ?? "").split(":")[0];
  if (host.split(".")[0] === "link") {
    const p = request.nextUrl.pathname;
    if (p === "/") {
      return NextResponse.redirect("https://canaldoanfitriao.com.br");
    }
    // Páginas públicas trazidas do Replit (build estático em public/<slug>/):
    // /<slug> serve o index.html sem mudar a URL; /<slug>/* são os assets.
    const replit = PAGINAS_REPLIT.find((s) => p === `/${s}` || p.startsWith(`/${s}/`));
    if (replit) {
      if (p !== `/${replit}`) return NextResponse.next();
      const u = request.nextUrl.clone();
      u.pathname = `/${replit}/index.html`;
      return NextResponse.rewrite(u);
    }
    // Imersão Gigantes: a página do Replit só redirecionava pro site do A5E.
    if (p === "/imersao-gigantes") {
      return NextResponse.redirect(`https://anfitriao5estrelas.com.br/${request.nextUrl.search}`, 307);
    }
    if (p === "/imersao" || p === "/vip" || p.startsWith("/i/") || ehLpPublica(p)) return NextResponse.next();
    if (p.startsWith("/r/")) return NextResponse.next();
    // Interno com login: no subdomínio de links não tem sessão; manda pro painel.
    if (ehInternoComLogin(p)) {
      return NextResponse.redirect(`https://painel.canaldoanfitriao.com.br${p}${request.nextUrl.search}`);
    }
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
  // Rotas do Foley (agente dos grupos no WhatsApp): sem sessão, exigem o
  // Bearer FOLEY_API_TOKEN e respondem 401 sem ele.
  if (pathname.startsWith("/api/foley/")) {
    return NextResponse.next();
  }
  // Rota do OpenClaw que entrega o feedback das calls aos vendedores: sem
  // sessão, exige o Bearer OPENCLAW_FEEDBACK_TOKEN e responde 401 sem ele.
  if (pathname.startsWith("/api/openclaw/")) {
    return NextResponse.next();
  }
  // Agenda das calls (.ics) assinada no Google Agenda: o Google busca sem
  // sessão; a rota exige a chave dela (?k=) e responde 404 sem ela.
  if (pathname.startsWith("/api/agenda/")) {
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
  // Deck do A5E: público (vai pro lead), sem login; o conteúdo vem do projeto
  // deck-a5e pelo rewrite do next.config.
  if (pathname === "/deck" || pathname.startsWith("/deck/")) {
    return NextResponse.next();
  }
  // Páginas de roteiro da call: fora do login do painel, com senha própria
  // (src/lib/roteiros/porta.ts, ROTEIRO_SENHA na Vercel).
  if (pathname === "/roteiro-sales-call-atual" || pathname === "/roteiro-sales-call-nova") {
    return NextResponse.next();
  }
  // Calculadora de Ganhos (pública: só faz conta, vai pro lead na call e na
  // visita técnica) e as imagens da marca que ela e os roteiros usam.
  if (pathname === "/calculadora" || pathname.startsWith("/marca/")) {
    return NextResponse.next();
  }
  // Cofre de Cases e o chat dele: senha própria (a dos roteiros), conferida na
  // rota (src/lib/roteiros/porta.ts).
  if (pathname === "/cofre" || pathname.startsWith("/cofre/")) {
    return NextResponse.next();
  }
  // Manifesto e ícones do app Agenda (o iPhone busca ao instalar).
  if (pathname === "/agenda.webmanifest" || pathname === "/apple-touch-icon-agenda.png" || pathname.startsWith("/icon-agenda-")) {
    return NextResponse.next();
  }
  // Redirect curto dos QR codes/links: público (é escaneado por qualquer um,
  // antes de virar lead). Valida o slug por conta própria.
  if (pathname.startsWith("/r/")) {
    return NextResponse.next();
  }
  // Links fixos da Imersão A5E (sala da turma, /i/<codigo> e grupo VIP): públicos, vão pro
  // comprador. Também respondem no domínio do painel.
  if (pathname === "/imersao" || pathname === "/vip" || pathname.startsWith("/i/") || ehLpPublica(pathname)) {
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
    // Volta pra página pedida depois do login (o app Agenda abre em
    // /calls/agenda e tem login próprio no iPhone).
    const login = new URL("/login", request.url);
    if (!pathname.startsWith("/api") && pathname !== "/") login.searchParams.set("de", pathname);
    return NextResponse.redirect(login);
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
