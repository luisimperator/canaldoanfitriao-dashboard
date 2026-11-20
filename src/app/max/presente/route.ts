import type { NextRequest } from "next/server";
import { MAX_WHATSAPP } from "@/lib/max-lp";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Presente do Max (Fernando, 20/11): link curto que o Téo manda no lugar do
// wa.me comprido ("pode ser um link normal"). Abre o WhatsApp do Max com a
// mensagem pronta e conta o clique em max_lp_eventos (utm_source
// 'teo-presente'). A prévia do link (robôs do WhatsApp e afins) não conta.

export const dynamic = "force-dynamic";

// "Vim do Téo" fica na mensagem pra rastrear a origem do lado do Max
// (Fernando, 20/11: "é bom pra gente depois traquear a source").
const MENSAGEM = "Oi, Max! Vim do Téo, ele me mandou pegar meus 30 minutos grátis 🎁";
const ROBO = /facebookexternalhit|facebot|whatsapp|bot|crawler|spider|preview|telegram|slack|discord/i;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(req: NextRequest) {
  const destino = `https://wa.me/${MAX_WHATSAPP}?text=${encodeURIComponent(MENSAGEM)}`;
  const ua = req.headers.get("user-agent") ?? "";
  if (!ROBO.test(ua)) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase
        .from("max_lp_eventos")
        .insert({ tipo: "clique", utm_source: "teo-presente", referer: null, fbclid: false })
        .then(
          () => null,
          () => null
        );
    }
  }
  const imagem = `${req.nextUrl.origin}/max/avatar.jpg`;
  const titulo = "🎁 30 minutos com o Max de presente";
  const descricao = "Toque pra abrir o WhatsApp do Max, a IA do anfitrião de Airbnb, com a mensagem pronta.";
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:image" content="${esc(imagem)}">
<meta property="og:type" content="website">
<meta http-equiv="refresh" content="0;url=${esc(destino)}">
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f0d;color:#f2f5f3;font:16px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px;box-sizing:border-box}
  .c{text-align:center;max-width:360px}
  img{width:88px;height:88px;border-radius:50%;object-fit:cover}
  a{display:inline-block;margin-top:18px;background:#25d366;color:#06240f;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:999px}
</style>
</head>
<body>
<div class="c">
  <img src="${esc(imagem)}" alt="Max">
  <h1 style="font-size:20px;margin:14px 0 6px">${esc(titulo)}</h1>
  <p style="margin:0;color:#b9c4bd">Abrindo o WhatsApp do Max…</p>
  <a href="${esc(destino)}">Pegar meu presente</a>
</div>
<script>location.replace(${JSON.stringify(destino)});</script>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
