import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Edita um deck público (pub/<pasta>/deck.txt no Storage, servido em
// /deck-black, /deck-gigantes, /deck-alfaiate e /deck): trocas de texto exatas e troca de
// imagem do IMGS embutido. Antes de gravar, guarda a versão atual em
// pub/<pasta>/backup/. Sem sessão: exige o header x-deck-chave (segredo
// deck_editar_chave do Vault, migração 0155), chamado pelo banco.
//
// Corpo: { pasta, base?, trocas?: [{ de, para }], imagens?: { "max.jpg": { url, lado? } }, testar? }
// Cada "de" tem que aparecer exatamente uma vez; senão nada é gravado.
// "base" (outra pasta) cria um deck novo a partir dela quando a pasta ainda
// não tem deck.txt: as trocas valem sobre a cópia (ex.: deck-alfaiate, 26/11).

export const maxDuration = 60;

const PASTAS = new Set(["deck-black", "deck-gigantes", "deck-a5e", "deck-alfaiate"]);

interface Pedido {
  pasta?: string;
  base?: string;
  trocas?: { de: string; para: string }[];
  imagens?: Record<string, { url: string; lado?: number }>;
  testar?: boolean;
}

function igual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function contar(texto: string, trecho: string): number {
  let n = 0;
  for (let i = texto.indexOf(trecho); i !== -1; i = texto.indexOf(trecho, i + trecho.length)) n++;
  return n;
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  const { data: chave } = await supabase.rpc("deck_editar_chave");
  const enviada = req.headers.get("x-deck-chave") ?? "";
  if (!chave || !enviada || !igual(String(chave), enviada)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const p = (await req.json().catch(() => ({}))) as Pedido;
  if (!p.pasta || !PASTAS.has(p.pasta)) return NextResponse.json({ error: "pasta inválida." }, { status: 400 });

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ler = (pasta: string) =>
    fetch(`${base}/storage/v1/object/public/pub/${pasta}/deck.txt?v=${Date.now()}`, { cache: "no-store" });
  let r = await ler(p.pasta);
  let novo = false;
  if (!r.ok && p.base && PASTAS.has(p.base) && p.base !== p.pasta) {
    r = await ler(p.base);
    novo = true;
  }
  if (!r.ok) return NextResponse.json({ error: `não li o deck (${r.status})` }, { status: 502 });
  const antes = novo ? "" : await r.text();
  let deck = novo ? await r.text() : antes;

  const erros: string[] = [];
  for (const t of p.trocas ?? []) {
    const n = contar(deck, t.de);
    if (n !== 1) {
      erros.push(`"${t.de.slice(0, 80)}" aparece ${n}x`);
      continue;
    }
    deck = deck.replace(t.de, () => t.para);
  }

  const imagens: { nome: string; bytes: number }[] = [];
  for (const [nome, img] of Object.entries(p.imagens ?? {})) {
    const re = new RegExp(`"${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"data:image/[a-z+]+;base64,[A-Za-z0-9+/=]+"`, "g");
    const achou = deck.match(re)?.length ?? 0;
    if (achou !== 1) {
      erros.push(`imagem ${nome} aparece ${achou}x no IMGS`);
      continue;
    }
    const f = await fetch(img.url).catch(() => null);
    if (!f || !f.ok) {
      erros.push(`não baixei ${img.url} (${f?.status ?? "erro"})`);
      continue;
    }
    const lado = Math.min(Math.max(img.lado ?? 800, 64), 2000);
    const jpg = await sharp(Buffer.from(await f.arrayBuffer()))
      .resize(lado, lado, { fit: "cover" })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
    deck = deck.replace(re, () => `"${nome}":"data:image/jpeg;base64,${jpg.toString("base64")}"`);
    imagens.push({ nome, bytes: jpg.length });
  }

  if (erros.length) return NextResponse.json({ ok: false, erros }, { status: 422 });
  if (p.testar || deck === antes) {
    return NextResponse.json({ ok: true, testar: true, antes: antes.length, depois: deck.length, imagens, mudou: deck !== antes });
  }

  const quando = new Date().toISOString().replace(/[:.]/g, "-");
  const tipo = "text/plain; charset=utf-8";
  if (!novo) {
    const bk = await supabase.storage
      .from("pub")
      .upload(`${p.pasta}/backup/deck-${quando}.txt`, new Blob([antes], { type: tipo }), { contentType: tipo, upsert: false });
    if (bk.error) return NextResponse.json({ error: `backup: ${bk.error.message}` }, { status: 500 });
  }
  const up = await supabase.storage
    .from("pub")
    .upload(`${p.pasta}/deck.txt`, new Blob([deck], { type: tipo }), { contentType: tipo, upsert: true, cacheControl: "60" });
  if (up.error) return NextResponse.json({ error: `upload: ${up.error.message}` }, { status: 500 });

  await supabase.from("webhook_log").insert({
    source: "decks",
    note: `deck editado: ${p.pasta}`,
    body: { pasta: p.pasta, trocas: (p.trocas ?? []).length, imagens, antes: antes.length, depois: deck.length, backup: `${p.pasta}/backup/deck-${quando}.txt` },
  });
  return NextResponse.json({ ok: true, antes: antes.length, depois: deck.length, imagens, backup: `${p.pasta}/backup/deck-${quando}.txt` });
}
