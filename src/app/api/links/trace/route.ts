import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";

// GET /api/links/trace?slug=...
//
// Segue a cadeia de redirects do link e conta, salto a salto, quais parâmetros
// de rastreio continuaram vivos.
//
// A cadeia é onde o rastreio morre na prática: o /r/<slug> carimba os UTMs
// certinho, mas basta a LP redirecionar uma vez (www, /pt-br, encurtador da
// plataforma, A/B) para os parâmetros caírem no caminho — e aí o lead entra sem
// origem e ninguém descobre por quê. Só 2% dos leads dos últimos 90 dias
// chegaram com alguma marca; testar isso na mão, salto a salto, é inviável.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "vidorigem"];
const MAX_SALTOS = 10;

interface Salto {
  url: string;
  status: number | null;
  params: string[];
  perdidos: string[];
  erro?: string;
}

export async function GET(req: NextRequest) {
  const access = await getAccess();
  if (!access.authed) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) return NextResponse.json({ error: "Informe o slug." }, { status: 400 });

  const { data: link } = await supabase
    .from("tracked_links")
    .select("destination, utm_source, utm_medium, utm_campaign, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!link?.destination) {
    return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
  }

  // Monta a URL de saída igual ao /r/<slug> faz, para testar a MESMA coisa que
  // o cliente recebe.
  let dest: URL;
  try {
    dest = new URL(link.destination);
  } catch {
    return NextResponse.json({ error: "O destino salvo não é uma URL válida." }, { status: 400 });
  }
  const set = (k: string, v: string | null | undefined) => {
    if (v && v.trim() && !dest.searchParams.has(k)) dest.searchParams.set(k, v.trim());
  };
  set("utm_source", link.utm_source);
  set("utm_medium", link.utm_medium);
  set("utm_campaign", link.utm_campaign);
  set("utm_content", link.slug);
  set("vidorigem", link.slug);

  const presentes = (u: string): string[] => {
    try {
      const q = new URL(u).searchParams;
      return PARAMS.filter((p) => q.get(p));
    } catch {
      return [];
    }
  };

  const saltos: Salto[] = [];
  let atual = dest.toString();

  for (let i = 0; i < MAX_SALTOS; i++) {
    const params = presentes(atual);
    try {
      const res = await fetch(atual, {
        method: "GET",
        redirect: "manual",
        headers: {
          // Sem User-Agent de navegador, parte das LPs responde diferente (ou
          // bloqueia) e o teste não representa o que o cliente vive.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(8000),
      });

      saltos.push({ url: atual, status: res.status, params, perdidos: [] });

      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        atual = new URL(loc, atual).toString();
        continue;
      }
      break;
    } catch (e) {
      saltos.push({
        url: atual,
        status: null,
        params,
        perdidos: [],
        erro: e instanceof Error ? e.message : "falha ao acessar",
      });
      break;
    }
  }

  // Marca o que sumiu em cada salto em relação ao anterior.
  for (let i = 1; i < saltos.length; i++) {
    saltos[i].perdidos = saltos[i - 1].params.filter((p) => !saltos[i].params.includes(p));
  }

  const finais = saltos.length > 0 ? saltos[saltos.length - 1].params : [];
  const perdidos = PARAMS.filter((p) => !finais.includes(p));

  return NextResponse.json({
    slug,
    saltos,
    url_final: saltos.length > 0 ? saltos[saltos.length - 1].url : null,
    params_sobreviveram: finais,
    params_perdidos: perdidos,
    // vidorigem é o que a página de Origem e a de Links leem para casar o lead
    // com o link. Sem ele, o lead entra órfão mesmo com os utm_* intactos.
    rastreio_ok: finais.includes("vidorigem"),
  });
}
