import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { suggestRule } from "@/lib/support-ai";

// POST /api/support/kb/prompt — a "caixinha mágica" da Base de conhecimento.
// Recebe a regra escrita de qualquer jeito ({ texto }), a IA reescreve no
// imperativo, escolhe o bloco certo e o item entra no fim daquele bloco.
// Fatos que faltarem viram [PREENCHER] — a IA não inventa preço nem prazo.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const access = await getAccess();
  if (!access.authed) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  let body: { texto?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  if (texto.length < 10) {
    return NextResponse.json(
      { error: "Escreva a regra com um pouco mais de contexto (10+ caracteres)." },
      { status: 400 }
    );
  }

  const sugestao = await suggestRule(texto);

  // entra no fim do bloco escolhido, sem bagunçar a ordem dos existentes
  const { data: ultimo } = await admin
    .from("support_kb")
    .select("ordem")
    .eq("bloco", sugestao.bloco)
    .order("ordem", { ascending: false })
    .limit(1);
  const ordem = Number(ultimo?.[0]?.ordem ?? 0) + 1;

  const { data, error } = await admin
    .from("support_kb")
    .insert({
      bloco: sugestao.bloco,
      titulo: sugestao.titulo,
      conteudo: sugestao.conteudo,
      ativo: true,
      ordem,
      valido_ate: null,
      updated_at: new Date().toISOString(),
    })
    .select("id,bloco,titulo,conteudo,ativo,ordem,updated_at,valido_ate")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
