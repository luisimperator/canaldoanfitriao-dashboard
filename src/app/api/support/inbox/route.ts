import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { sendWhatsappText } from "@/lib/whatsapp";
import { resolveWaPhone } from "@/lib/support";

// Caixa de entrada do suporte.
//
// GET  ?phone=...  → mensagens da conversa (e zera as não lidas)
// GET  (sem phone) → lista de conversas
// POST { phone, text }        → responde como humano (desliga a IA na conversa)
// PATCH { phone, iaAtiva?, status? } → liga/desliga a IA, resolve a conversa

export const dynamic = "force-dynamic";

const JANELA_HORAS = 24;

async function guard() {
  const access = await getAccess();
  if (!access.authed) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  return { access, admin };
}

export async function GET(req: NextRequest) {
  const ctx = await guard();
  if (!ctx) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const pedido = req.nextUrl.searchParams.get("phone");
  // A fila de handoff manda o telefone como o cliente escreveu ("11-97467-7033").
  // Resolvemos pro wa_phone real antes de puxar a conversa.
  const phone = pedido ? (await resolveWaPhone(pedido)) ?? pedido : null;

  if (!phone) {
    const { data, error } = await ctx.admin
      .from("support_conversas")
      .select("wa_phone,nome,ultimo_texto,ultimo_em,ultima_entrada_em,nao_lidas,ia_ativa,status,atendente")
      .order("ultimo_em", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ conversas: data ?? [] });
  }

  const { data: msgs, error } = await ctx.admin
    .from("support_messages")
    .select("id,direction,text,tipo,media_path,media_mime,autor,wa_status,escalated,created_at")
    .eq("wa_phone", phone)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Assina as mídias (bucket é privado): 1h de validade, o suficiente pra ler.
  const comMidia = await Promise.all(
    (msgs ?? []).map(async (m) => {
      if (!m.media_path) return m;
      const { data: signed } = await ctx.admin.storage
        .from("whatsapp")
        .createSignedUrl(m.media_path, 3600);
      return { ...m, media_url: signed?.signedUrl ?? null };
    })
  );

  await ctx.admin.from("support_conversas").update({ nao_lidas: 0 }).eq("wa_phone", phone);

  const { data: conversa } = await ctx.admin
    .from("support_conversas")
    .select("wa_phone,nome,ultima_entrada_em,ia_ativa,status,atendente")
    .eq("wa_phone", phone)
    .maybeSingle();

  return NextResponse.json({ mensagens: comMidia, conversa });
}

export async function POST(req: NextRequest) {
  const ctx = await guard();
  if (!ctx) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const phone = String(body?.phone ?? "").trim();
  const text = String(body?.text ?? "").trim();
  if (!phone || !text) {
    return NextResponse.json({ error: "phone e text são obrigatórios." }, { status: 400 });
  }

  // Janela de 24h da Meta: fora dela, texto livre não é entregue — só template.
  const { data: conversa } = await ctx.admin
    .from("support_conversas")
    .select("ultima_entrada_em")
    .eq("wa_phone", phone)
    .maybeSingle();
  const ultima = conversa?.ultima_entrada_em ? Date.parse(conversa.ultima_entrada_em) : 0;
  const fechada = !ultima || Date.now() - ultima > JANELA_HORAS * 3600_000;
  if (fechada) {
    return NextResponse.json(
      {
        error:
          "Janela de 24h fechada: o WhatsApp só entrega mensagem iniciada por template aprovado. Peça ao cliente para escrever de novo ou use um template.",
      },
      { status: 409 }
    );
  }

  const sent = await sendWhatsappText(phone, text);
  if (!sent.ok) {
    return NextResponse.json({ error: sent.error ?? "falha ao enviar" }, { status: 502 });
  }

  await ctx.admin.from("support_messages").insert({
    wa_phone: phone,
    direction: "out",
    text,
    tipo: "text",
    autor: "humano",
    wa_message_id: sent.id ?? null,
  });

  // Humano entrou na conversa: a IA cala a boca até religarem.
  await ctx.admin
    .from("support_conversas")
    .update({ ia_ativa: false, atendente: ctx.access.email ?? "painel" })
    .eq("wa_phone", phone);

  return NextResponse.json({ ok: true, id: sent.id });
}

export async function PATCH(req: NextRequest) {
  const ctx = await guard();
  if (!ctx) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const phone = String(body?.phone ?? "").trim();
  if (!phone) return NextResponse.json({ error: "phone é obrigatório." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body?.iaAtiva === "boolean") patch.ia_ativa = body.iaAtiva;
  if (body?.status === "aberta" || body?.status === "resolvida") patch.status = body.status;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nada para atualizar." }, { status: 400 });
  }

  const { error } = await ctx.admin
    .from("support_conversas")
    .update(patch)
    .eq("wa_phone", phone);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
