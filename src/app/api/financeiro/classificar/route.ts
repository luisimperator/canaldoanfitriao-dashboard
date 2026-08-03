import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { canAccess } from "@/lib/access";

// Classificação financeira pela tela: reclassificar um lançamento na mão
// (vira category_source='manual', imune às regras), criar/apagar regra e
// reaplicar as regras (fin_reclassificar, migração 0032).
//
// Toda escrita revalida o cache do dashboard na hora — senão a Visão geral
// financeira fica até 5 minutos mostrando o número antigo logo depois de o
// usuário corrigir, o que parece bug.

async function autorizado() {
  const access = await getAccess();
  if (!access.authed || !canAccess("/financeiro/classificar", access)) return null;
  return access;
}

function fresco() {
  revalidateTag("dashboard", { expire: 0 });
}

// Reclassificar um lançamento. categoryId null = "voltar pra regra": limpa a
// marca manual e reaplica as regras pra ele receber o que elas mandarem.
export async function PATCH(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  if (!(await autorizado())) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  const categoryId = typeof body?.categoryId === "string" ? body.categoryId : null;
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });

  const { error } = await supabase
    .from("fin_transactions")
    .update(
      categoryId
        ? { category_id: categoryId, category_source: "manual" }
        : { category_id: null, category_source: "rule" }
    )
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let reclass: unknown = null;
  if (!categoryId) {
    const { data, error: e2 } = await supabase.rpc("fin_reclassificar");
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    reclass = data;
  }
  fresco();
  return NextResponse.json({ ok: true, reclass });
}

// Criar regra ({ padrao, direction, categoryId }) ou só reaplicar as regras
// ({ action: "reclassificar" }).
export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  if (!(await autorizado())) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const body = await req.json().catch(() => null);

  if (body?.action === "reclassificar") {
    const { data, error } = await supabase.rpc("fin_reclassificar");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    fresco();
    return NextResponse.json({ ok: true, reclass: data });
  }

  const padrao = typeof body?.padrao === "string" ? body.padrao.trim() : "";
  const direction =
    body?.direction === "in" || body?.direction === "out" ? body.direction : null;
  const categoryId = typeof body?.categoryId === "string" ? body.categoryId : null;
  // Sem âncora de verdade a regra vira pega-tudo: '%a%' casaria o extrato
  // inteiro na prioridade 95 e engoliria as regras de baixo.
  if (padrao.replace(/%/g, "").trim().length < 3) {
    return NextResponse.json(
      { error: "Padrão curto demais — use pelo menos 3 caracteres além dos %." },
      { status: 400 }
    );
  }
  if (!categoryId) return NextResponse.json({ error: "Categoria obrigatória." }, { status: 400 });

  const { error } = await supabase.from("fin_rules").insert({
    // depois das regras semeadas (10-90) e antes da rede de segurança
    prioridade: 95,
    padrao: padrao.includes("%") ? padrao : `%${padrao}%`,
    direction,
    category_id: categoryId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data, error: e2 } = await supabase.rpc("fin_reclassificar");
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  fresco();
  return NextResponse.json({ ok: true, reclass: data });
}

// Apagar regra e reaplicar (o que ela classificava volta pro que sobrar).
export async function DELETE(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  if (!(await autorizado())) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const ruleId = typeof body?.ruleId === "string" ? body.ruleId : null;
  if (!ruleId) return NextResponse.json({ error: "ruleId obrigatório." }, { status: 400 });

  const { error } = await supabase.from("fin_rules").delete().eq("id", ruleId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data, error: e2 } = await supabase.rpc("fin_reclassificar");
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  fresco();
  return NextResponse.json({ ok: true, reclass: data });
}
