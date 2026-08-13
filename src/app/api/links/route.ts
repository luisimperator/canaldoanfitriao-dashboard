import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Cria um link curto rastreável (QR aponta pra cá). O slug é gerado a partir do
// apelido; se colidir, ganha um sufixo aleatório. O destino e os UTMs ficam
// guardados e são colados no redirect /r/<slug>.

const MAX_SLUG = 60;

function slugify(s: string): string {
  const full = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (full.length <= MAX_SLUG) return full;
  // Corta na última palavra INTEIRA que cabe. Antes o .slice() vinha depois de
  // limpar as pontas e podia parar em cima de um hífen — "…lista-de-espera"
  // virava "…lista-de-", com hífen solto no fim da URL.
  const cut = full.slice(0, MAX_SLUG);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
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

// Lixeira: some da lista, mas a linha fica. Um QR já impresso continua existindo
// no mundo — apagar de vez faria o scan cair num 404 sem rastro de que o link
// existiu. Não há delete definitivo exposto em lugar nenhum.
export async function DELETE(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const slug = new URL(req.url).searchParams.get("slug")?.trim();
  if (!slug) return NextResponse.json({ error: "Informe o slug." }, { status: 400 });

  const { error } = await supabase
    .from("tracked_links")
    .update({ deleted_at: new Date().toISOString() })
    .eq("slug", slug)
    .is("deleted_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Editar (?slug=x) ou restaurar da lixeira (?slug=x&action=restore).
//
// O slug NUNCA muda aqui, de propósito: ele é o que está impresso no QR. Todo o
// resto é editável — é essa a razão de existir do link intermediário. O QR nasce
// antes do vídeo, então o campo do YouTube fica vazio no começo e é preenchido
// depois; e o destino pode trocar sem reimprimir nada.
const CAMPOS_EDITAVEIS = ["label", "product", "utm_campaign", "youtube_url"] as const;

export async function PATCH(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  if (!slug) return NextResponse.json({ error: "Informe o slug." }, { status: 400 });

  if (url.searchParams.get("action") === "restore") {
    const { error } = await supabase
      .from("tracked_links")
      .update({ deleted_at: null })
      .eq("slug", slug);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const patch: Record<string, string | null> = {};

  if ("destination" in body) {
    const destination = String(body.destination ?? "").trim();
    if (!destination) {
      return NextResponse.json({ error: "Informe o destino (LP)." }, { status: 400 });
    }
    try {
      new URL(destination);
    } catch {
      return NextResponse.json({ error: "Destino não é uma URL válida." }, { status: 400 });
    }
    patch.destination = destination;
  }

  for (const campo of CAMPOS_EDITAVEIS) {
    if (campo in body) patch[campo] = String(body[campo] ?? "").trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const { error } = await supabase.from("tracked_links").update(patch).eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
