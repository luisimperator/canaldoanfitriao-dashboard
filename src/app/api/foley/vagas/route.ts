import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Vaga transferida (migração 0141; Fernando, 21/11, pelo Foley): o membro que
// larga o Airbnb passa a vaga pra outra pessoa. Quem entra vale enquanto a
// compra do dono valer; o dono pode sair do grupo sem a vaga cair. No
// /api/foley/situacao a pessoa nova vem com a decisão da compra do dono e
// motivo "vaga_transferida" (se tiver compra própria valendo, vale a própria).
//
// Authorization: Bearer <FOLEY_API_TOKEN>
// POST /api/foley/vagas
//   { "telefone_novo": "5511...", "nome_novo": "opcional", "dono_telefone": "...",
//     "dono_email": "...", "dono_nome": "opcional", "grupo": "a5e" | "gigantes",
//     "autorizado_por": "Fernando", "ativo": true }
//   Mesma pessoa/grupo de novo atualiza o cadastro; "ativo": false desliga a vaga.
//   Resposta: a vaga e a situação atual da pessoa nova.
// GET /api/foley/vagas            vagas ativas, com a situação de cada pessoa nova
// GET /api/foley/vagas?todas=1    inclui as desligadas (sem a situação)

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: NextRequest): boolean {
  const token = process.env.FOLEY_API_TOKEN;
  return Boolean(token) && req.headers.get("authorization") === `Bearer ${token}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!autorizado(req)) return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ ok: false, erro: "banco não configurado" }, { status: 500 });
    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("foley_vaga_registrar", { p: corpo ?? {} });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    const r = data as { ok?: boolean } | null;
    return NextResponse.json(r ?? { ok: false, erro: "sem resposta" }, { status: r?.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!autorizado(req)) return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ ok: false, erro: "banco não configurado" }, { status: 500 });
    const todas = req.nextUrl.searchParams.get("todas") === "1";
    let q = supabase
      .from("foley_vagas")
      .select("id, criado_em, atualizado_em, telefone_novo, nome_novo, grupo, dono_telefone, dono_email, dono_nome, autorizado_por, ativo")
      .order("criado_em", { ascending: false })
      .limit(500);
    if (!todas) q = q.eq("ativo", true);
    const { data: vagas, error } = await q;
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    const lista = vagas ?? [];
    if (todas || lista.length === 0) return NextResponse.json({ ok: true, vagas: lista });

    // Situação de cada pessoa nova agora (mesma regra do /situacao, sem a pausa).
    const { data: sit } = await supabase.rpc("foley_situacao_calc", {
      p_itens: lista.map((v) => ({ telefone: v.telefone_novo, grupo: v.grupo })),
    });
    const s = (Array.isArray(sit) ? sit : []) as Record<string, unknown>[];
    return NextResponse.json({
      ok: true,
      vagas: lista.map((v, i) => ({
        ...v,
        situacao: s[i] ? { decisao: s[i].decisao, motivo: s[i].motivo, fonte: s[i].fonte, valido_ate: s[i].valido_ate } : null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: String(e).slice(0, 300) }, { status: 500 });
  }
}
