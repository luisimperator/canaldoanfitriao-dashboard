import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { registrarClique, turmaParaCompra } from "@/lib/imersao";

// Contador próprio da LP da Imersão: o navegador manda (sendBeacon) um POST
// pra /t/pv ao carregar e pra /t/click no clique em comprar. Grava em
// imersao_cliques com rota "lp_pv"/"lp_click" — rotas novas, de propósito: as
// views do funil (imersao_resumo, imersao_variantes) contam "lp" e
// "checkout", que o servidor já grava, e não dobram.
//
// Corpo (texto JSON): { u: location.search, ref, turma, variante, destino? }.
// Rate limit simples por IP (por instância): 30 eventos/min.

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

const VARIANTES = ["longa", "curta"];
const ehData = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (s: unknown, max: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, max) : null);

export async function registrarEventoLp(req: NextRequest, rota: "lp_pv" | "lp_click"): Promise<Response> {
  const ok = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  if (estourou(ip)) return new Response(null, { status: 429 });

  let corpo: Record<string, unknown> = {};
  try {
    const txt = (await req.text()).slice(0, 4000);
    corpo = txt ? (JSON.parse(txt) as Record<string, unknown>) : {};
  } catch {
    /* corpo inválido: registra só o que vem nos headers */
  }

  const params = new URLSearchParams(str(corpo.u, 2000) ?? "");
  const headers = new Headers(req.headers);
  // referer da página (o do beacon é a própria LP)
  const ref = str(corpo.ref, 300);
  if (ref) headers.set("referer", ref);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const fbclid = params.get("fbclid");
    await registrarClique(supabase, { headers, params }, {
      rota,
      turma_data: ehData(corpo.turma) ? corpo.turma : turmaParaCompra(new Date()),
      momento: rota === "lp_pv" ? "pv" : "clique",
      // no clique, o destino (/comprar com os parâmetros); na visita, o fbclid
      destino: rota === "lp_click" ? str(corpo.destino, 1000) : fbclid ? `fbclid=${fbclid.slice(0, 500)}` : null,
      variante: VARIANTES.includes(String(corpo.variante)) ? String(corpo.variante) : "longa",
    });
  }
  return ok;
}
