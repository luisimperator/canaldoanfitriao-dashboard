import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { canAccess } from "@/lib/access";

// Botão do Painel Calls: corrige na mão a presença de uma call.
//   presenca "realizada" | "falta": vale sobre a gravação e a nota do vendedor
//   presenca null: tira a correção e volta pra régua automática (gravação do
//   Teams ou nota #call/#faltou, lida de novo no próximo cron das calls)
export async function POST(req: NextRequest) {
  const access = await getAccess();
  if (!access.authed || !canAccess("/calls", access)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const { id, presenca } = (await req.json().catch(() => ({}))) as { id?: string; presenca?: string | null };
  if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
  if (presenca !== null && presenca !== "realizada" && presenca !== "falta") {
    return NextResponse.json({ error: "presenca deve ser realizada, falta ou null." }, { status: 400 });
  }

  const { data: call } = await supabase.from("teo_calls").select("id, inicio, status").eq("id", id).maybeSingle();
  if (!call) return NextResponse.json({ error: "Call não encontrada." }, { status: 404 });
  if (call.status === "cancelada") return NextResponse.json({ error: "Call cancelada." }, { status: 400 });
  if (new Date(call.inicio).getTime() > Date.now()) {
    return NextResponse.json({ error: "A call ainda não aconteceu." }, { status: 400 });
  }

  const mudanca =
    presenca === null
      ? { presenca: null, presenca_fonte: null, presenca_nota: null, presenca_em: null, presenca_por: null }
      : {
          presenca,
          presenca_fonte: "painel",
          presenca_nota: null,
          presenca_em: new Date().toISOString(),
          presenca_por: access.email ?? "painel",
        };
  const { error } = await supabase.from("teo_calls").update(mudanca).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from("webhook_log").insert({
    source: "calls",
    note: "presença pelo painel",
    body: { teo_call_id: id, presenca, por: access.email ?? "painel" },
  });
  return NextResponse.json({
    ok: true,
    mensagem: presenca === null ? "Voltou pra régua automática" : presenca === "realizada" ? "Marcada como realizada" : "Marcada como falta",
  });
}
