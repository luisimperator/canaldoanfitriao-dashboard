import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Cria um link curto rastreável (QR aponta pra cá). O slug é gerado a partir do
// apelido; se colidir, ganha um sufixo aleatório. O destino e os UTMs ficam
// guardados e são colados no redirect /r/<slug>.

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function rand(n: number): string {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const destination = String(body.destination ?? "").trim();
  const label = String(body.label ?? "").trim();
  if (!destination) return NextResponse.json({ error: "Informe o destino (LP)." }, { status: 400 });
  try {
    new URL(destination);
  } catch {
    return NextResponse.json({ error: "Destino não é uma URL válida." }, { status: 400 });
  }

  const base = slugify(label || String(body.product ?? "") || "link") || "link";

  const row = {
    label: label || null,
    product: (String(body.product ?? "").trim() || null) as string | null,
    destination,
    utm_source: String(body.utm_source ?? "youtube").trim() || "youtube",
    utm_medium: String(body.utm_medium ?? "qr").trim() || "qr",
    utm_campaign: (String(body.utm_campaign ?? "").trim() || null) as string | null,
    youtube_url: (String(body.youtube_url ?? "").trim() || null) as string | null,
  };

  // tenta o slug base; se já existe, tenta com sufixo aleatório algumas vezes.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${rand(4)}`;
    const { data, error } = await supabase
      .from("tracked_links")
      .insert({ ...row, slug })
      .select("slug")
      .maybeSingle();
    if (!error && data) return NextResponse.json({ ok: true, slug: data.slug });
    // 23505 = unique_violation -> tenta outro slug
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Não consegui gerar um slug único." }, { status: 409 });
}
