import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { canAccess } from "@/lib/access";
import { historico } from "@/lib/teo";
import { converterMsg } from "@/lib/teo-mensagens";

// WhatsApp do Téo (aba /whatsapp-teo): só leitura, pra acompanhar o Téo quase
// em tempo real. A tela chama esta rota a cada poucos segundos.
//
// GET              → lista das conversas do Téo (RPC teo_whatsapp_lista: última
//                    atividade e prévia, ~50 ms)
// GET ?contact=ID  → a conversa: mensagens do Unnichat (o mesmo histórico que
//                    o Téo lê), áudios com a transcrição, calls e ficha

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await getAccess();
  if (!access.authed || !canAccess("/whatsapp-teo", access)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const contact = req.nextUrl.searchParams.get("contact");
  if (!contact) {
    const { data, error } = await supabase.rpc("teo_whatsapp_lista", { p_limite: 300 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // O contato de teste do dono não entra.
    const conversas = ((data ?? []) as { nome: string | null }[]).filter((c) => !/\(teste\)/i.test(c.nome ?? ""));
    return NextResponse.json({ conversas, agora: new Date().toISOString() });
  }

  if (!/^[A-Za-z0-9-]{8,64}$/.test(contact)) {
    return NextResponse.json({ error: "Contato inválido." }, { status: 400 });
  }

  const [{ data: conversa }, { data: calls }, { data: audios }] = await Promise.all([
    supabase
      .from("teo_conversas")
      .select("contact_id, nome, telefone, estado, respostas, ficha, motivo_humano, black_vendedor, erro, venda_teo")
      .eq("contact_id", contact)
      .maybeSingle(),
    supabase
      .from("teo_calls")
      .select("inicio, vendedor, status")
      .eq("contact_id", contact)
      .order("inicio", { ascending: true }),
    supabase.from("teo_audios").select("msg_id, texto").eq("contact_id", contact).not("texto", "is", null),
  ]);
  if (!conversa) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const textoAudio = new Map(
    ((audios ?? []) as { msg_id: string; texto: string }[]).map((a) => [a.msg_id, a.texto])
  );
  try {
    const msgs = (await historico(supabase, contact)).map((m) => converterMsg(m, textoAudio));
    return NextResponse.json({ conversa, calls: calls ?? [], msgs, agora: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { conversa, calls: calls ?? [], msgs: [], erro: e instanceof Error ? e.message : String(e) },
      { status: 200 }
    );
  }
}
