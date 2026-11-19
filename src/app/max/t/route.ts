import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Contador da LP do Max (sendBeacon): visita ("pv") e clique no WhatsApp
// ("clique"), com as UTMs do link. Grava em max_lp_eventos (migração 0132),
// sem IP nem dado pessoal. Corpo (texto JSON): { t, u: location.search, ref }.
// Limite simples por IP (por instância): 30 eventos/min.

export const dynamic = "force-dynamic";

const JANELA_MS = 60_000;
const LIMITE = 30;
const vistos = new Map<string, { n: number; desde: number }>();

function estourou(ip: string): boolean {
  const agora = Date.now();
  const v = vistos.get(ip);
  if (!v || agora - v.desde > JANELA_MS) {
    if (vistos.size > 5000) vistos.clear();
    vistos.set(ip, { n: 1, desde: agora });
    return false;
  }
  v.n++;
  return v.n > LIMITE;
}

const curto = (s: string | null, max = 120) => (s && s.trim() ? s.trim().slice(0, max) : null);

export async function POST(req: NextRequest) {
  const ok = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  if (estourou(ip)) return new Response(null, { status: 429 });
  let corpo: Record<string, unknown> = {};
  try {
    const txt = (await req.text()).slice(0, 4000);
    corpo = txt ? (JSON.parse(txt) as Record<string, unknown>) : {};
  } catch {
    return ok;
  }
  const tipo = corpo.t === "clique" ? "clique" : corpo.t === "pv" ? "pv" : null;
  if (!tipo) return ok;
  const p = new URLSearchParams(typeof corpo.u === "string" ? corpo.u.slice(0, 2000) : "");
  let referer: string | null = null;
  if (typeof corpo.ref === "string" && corpo.ref) {
    try {
      referer = new URL(corpo.ref).host.slice(0, 120) || null;
    } catch {
      referer = null;
    }
  }
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from("max_lp_eventos").insert({
      tipo,
      utm_source: curto(p.get("utm_source"))?.toLowerCase() ?? null,
      utm_medium: curto(p.get("utm_medium")),
      utm_campaign: curto(p.get("utm_campaign")),
      utm_content: curto(p.get("utm_content")),
      utm_term: curto(p.get("utm_term")),
      fbclid: Boolean(p.get("fbclid")),
      referer,
    });
  }
  return ok;
}
