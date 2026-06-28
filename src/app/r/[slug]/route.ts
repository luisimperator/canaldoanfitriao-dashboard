import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Redirect curto dos QR codes / links rastreáveis.
//   canaldoanfitriao.com.br/r/<slug>  ->  LP de destino + UTMs colados
// O slug é decidido na criação do link (antes do vídeo existir), então o QR
// pode ser impresso já — e o destino pode mudar depois sem reimprimir.
// Cada acesso registra um scan (link_scans) p/ medir scan -> lead -> MQL.

export const dynamic = "force-dynamic";

// Fallback quando o slug não existe (QR errado/antigo): manda pro site.
const FALLBACK = "https://canaldoanfitriao.com.br";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.redirect(FALLBACK);

  const { data: link } = await supabase
    .from("tracked_links")
    .select("destination, utm_source, utm_medium, utm_campaign, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!link?.destination) return NextResponse.redirect(FALLBACK);

  // best-effort: registra o scan sem travar o redirect
  supabase
    .from("link_scans")
    .insert({
      slug: link.slug,
      ua: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      ref: req.headers.get("referer")?.slice(0, 300) ?? null,
    })
    .then(
      () => {},
      () => {}
    );

  let dest: URL;
  try {
    dest = new URL(link.destination);
  } catch {
    return NextResponse.redirect(FALLBACK);
  }
  const set = (k: string, v: string | null | undefined) => {
    if (v && v.trim() && !dest.searchParams.has(k)) dest.searchParams.set(k, v.trim());
  };
  set("utm_source", link.utm_source);
  set("utm_medium", link.utm_medium);
  set("utm_campaign", link.utm_campaign);
  // o slug é a identidade do "momento/vídeo" — vai como content e vidorigem,
  // que é o que a página de Origem lê.
  set("utm_content", link.slug);
  set("vidorigem", link.slug);

  return NextResponse.redirect(dest.toString(), 302);
}
