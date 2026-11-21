import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Quem fica e quem sai do [Membros] A5E e do Gigantes, pro Foley (agente do
// OpenClaw que cuida dos grupos no WhatsApp). Ele consulta a cada 15 min;
// a regra está em supabase/migrations/0121_foley_situacao.sql (função
// foley_situacao). Só leitura: ninguém sai do grupo por esta rota.
//
// POST /api/foley/situacao
//   Authorization: Bearer <FOLEY_API_TOKEN>   (variável de ambiente da Vercel)
//   { "pessoas": [{ "telefone": "5511...", "email": "opcional", "grupo": "a5e" | "gigantes" }] }
// Resposta, na mesma ordem: decisao (fica | sai | sai_agora | protegido |
// nao_achei | pausado), motivo, fonte, ultimo_pagamento, valido_ate,
// dias_atraso e mudou/decisao_anterior (comparado com a consulta anterior da
// mesma pessoa). "pausado" = remoções pausadas em foley_config (migração
// 0135): quem a regra tiraria vem como pausado, com a decisão da regra em
// decisao_regra, e o robô não tira ninguém.
// Quem tocou em "Não quero renovar" no aviso de atraso (migração 0139) vem como
// sai_agora com motivo nao_quer_renovar, até pagar de novo. O painel guarda o
// WhatsApp de cada pessoa consultada aqui (foley_membros): é pra esse número
// que vão os avisos de atraso (atraso_1/3/6, cron das 10h07).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PESSOAS = 3000;

function autorizado(req: NextRequest): boolean {
  const token = process.env.FOLEY_API_TOKEN;
  return Boolean(token) && req.headers.get("authorization") === `Bearer ${token}`;
}

type Pessoa = { telefone: string; email?: string; grupo: "a5e" | "gigantes" };

function normalizar(bruto: unknown): Pessoa[] | string {
  if (!Array.isArray(bruto)) return "envie {\"pessoas\": [...]}";
  if (bruto.length === 0) return "a lista de pessoas está vazia";
  if (bruto.length > MAX_PESSOAS) return `no máximo ${MAX_PESSOAS} pessoas por chamada`;
  const out: Pessoa[] = [];
  for (const [i, p] of bruto.entries()) {
    const o = (p ?? {}) as Record<string, unknown>;
    const telefone = String(o.telefone ?? "").trim();
    if (!/\d{10,}/.test(telefone.replace(/\D/g, ""))) return `pessoas[${i}]: telefone inválido`;
    const g = String(o.grupo ?? "").toLowerCase();
    const grupo = g.startsWith("gig") ? "gigantes" : g === "a5e" ? "a5e" : null;
    if (!grupo) return `pessoas[${i}]: grupo tem que ser "a5e" ou "gigantes"`;
    const email = typeof o.email === "string" && o.email.includes("@") ? o.email.trim() : undefined;
    out.push({ telefone, grupo, ...(email ? { email } : {}) });
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, erro: "banco não configurado" }, { status: 500 });

  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }
  const pessoas = normalizar(corpo.pessoas);
  if (typeof pessoas === "string") return NextResponse.json({ ok: false, erro: pessoas }, { status: 400 });

  const { data, error } = await supabase.rpc("foley_situacao", { p_itens: pessoas });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const lista = (data ?? []) as { decisao: string; mudou: boolean }[];
  const totais: Record<string, number> = {};
  for (const p of lista) totais[p.decisao] = (totais[p.decisao] ?? 0) + 1;
  const { data: sync } = await supabase
    .from("assinaturas_eduzz")
    .select("sincronizado_em")
    .order("sincronizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    gerado_em: new Date().toISOString(),
    assinaturas_atualizadas_em: sync?.sincronizado_em ?? null,
    totais,
    mudaram: lista.filter((p) => p.mudou).length,
    pessoas: lista,
  });
}
