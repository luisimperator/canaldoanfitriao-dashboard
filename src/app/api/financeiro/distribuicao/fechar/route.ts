import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";

// Crava o valor da distribuição da competência corrente (o mesmo que o cron
// faz sozinho no dia do fechamento). Depois de cravado, o número não muda
// mais — é o que vai pro Pix.

export async function POST() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
  const access = await getAccess();
  if (!access.authed) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("distribuicao_fechar", {
    p_ref: new Date().toISOString().slice(0, 10),
    p_por: access.email ?? "painel",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // expire: 0 = a próxima leitura busca fresco (o padrão "max" serviria o
  // valor antigo por um tempo, e logo depois de cravar isso confunde).
  revalidateTag("provisao", { expire: 0 });
  return NextResponse.json({ ok: true, status: data });
}
