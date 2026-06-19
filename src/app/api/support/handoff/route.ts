import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";

// Fila de atendimento humano (handoff).
//
// POST  — cria um card (uso futuro pela IA/automação, autenticada por
//         SUPPORT_API_TOKEN; também aceita um humano logado criando manual).
// PATCH — muda o status de um card (aberto → em_andamento → resolvido).

const MOTIVOS = [
  "cancelamento_renovacao",
  "reembolso",
  "divergencia_pagamento",
  "brinde_nao_recebido",
  "resgate_bf",
  "duvida_acesso",
  "lead_comercial",
  "outro",
];
const STATUS = ["aberto", "em_andamento", "resolvido"];

async function authOk(req: NextRequest): Promise<boolean> {
  const token = process.env.SUPPORT_API_TOKEN;
  if (token && req.headers.get("authorization") === `Bearer ${token}`) return true;
  const access = await getAccess();
  return access.authed;
}

export async function POST(req: NextRequest) {
  if (!(await authOk(req))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const motivo = String(body.motivo ?? "outro");
  const row = {
    email: body.email ? String(body.email) : null,
    nome: body.nome ? String(body.nome) : null,
    telefone: body.telefone ? String(body.telefone) : null,
    motivo: MOTIVOS.includes(motivo) ? motivo : "outro",
    resumo: body.resumo ? String(body.resumo) : null,
    dados_coletados: body.dados_coletados ?? null,
  };

  const { data, error } = await admin
    .from("support_handoffs")
    .insert(row)
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data?.id });
}

export async function PATCH(req: NextRequest) {
  if (!(await authOk(req))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const id = body.id ? String(body.id) : "";
  const status = String(body.status ?? "");
  if (!id || !STATUS.includes(status)) {
    return NextResponse.json({ error: "id e status válidos são obrigatórios." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    resolved_at: status === "resolvido" ? new Date().toISOString() : null,
  };
  if (body.responsavel !== undefined) {
    patch.responsavel = body.responsavel ? String(body.responsavel) : null;
  }

  const { error } = await admin.from("support_handoffs").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
