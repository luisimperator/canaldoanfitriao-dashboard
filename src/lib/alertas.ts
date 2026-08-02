// Aviso de caso novo pro time de suporte.
//
// Quando a IA escala um caso (create_handoff), quem está de plantão recebe um
// toque no WhatsApp em vez de precisar lembrar de abrir o painel. Como o
// destinatário quase nunca está dentro da janela de 24h, o aviso vai por
// TEMPLATE aprovado — mensagem livre pra ele simplesmente não seria entregue.
//
// Quem recebe fica em support_notificacoes (tela Avisos, no painel), com liga/
// desliga por pessoa e filtro por motivo. O que já foi enviado fica em
// support_alertas, com unique (handoff_id, telefone): reentrega de webhook não
// vira toque dobrado.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendWhatsappTemplate } from "@/lib/whatsapp";

const MOTIVO_LABEL: Record<string, string> = {
  cancelamento_renovacao: "cancelamento de renovação",
  reembolso: "reembolso",
  divergencia_pagamento: "divergência de pagamento",
  brinde_nao_recebido: "brinde não recebido",
  resgate_bf: "resgate Black Friday",
  duvida_acesso: "dúvida de acesso",
  lead_comercial: "lead pro comercial",
  outro: "outro",
};

export interface ResultadoAviso {
  enviados: number;
  falhas: number;
  detalhes: { telefone: string; ok: boolean; erro?: string }[];
}

const VAZIO: ResultadoAviso = { enviados: 0, falhas: 0, detalhes: [] };

async function flag(chave: string, padrao: string): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) return padrao;
  const { data } = await admin
    .from("whatsapp_flags_extra")
    .select("valor")
    .eq("chave", chave)
    .maybeSingle();
  return data?.valor?.trim() || padrao;
}

/**
 * Avisa o time sobre um caso recém-aberto. Nunca lança: se o aviso falhar, o
 * atendimento do cliente segue normal — o caso continua na fila do painel.
 */
export async function avisarCasoNovo(handoffId: string): Promise<ResultadoAviso> {
  const admin = getSupabaseAdmin();
  if (!admin || !handoffId) return VAZIO;

  try {
    const { data: caso } = await admin
      .from("support_handoffs")
      .select("id,motivo,resumo,nome,email,telefone")
      .eq("id", handoffId)
      .maybeSingle();
    if (!caso) return VAZIO;

    const { data: pessoas } = await admin
      .from("support_notificacoes")
      .select("nome,telefone,motivos")
      .eq("ativo", true);
    if (!pessoas || pessoas.length === 0) return VAZIO;

    // motivos null/vazio = a pessoa quer todos os casos
    const alvos = pessoas.filter(
      (p) => !p.motivos || p.motivos.length === 0 || p.motivos.includes(caso.motivo)
    );
    if (alvos.length === 0) return VAZIO;

    const template = await flag("alerta_template", "caso_suporte_novo");
    const idioma = await flag("alerta_idioma", "pt_BR");

    const motivo = MOTIVO_LABEL[caso.motivo] ?? caso.motivo;
    const cliente = caso.nome || caso.email || caso.telefone || "sem identificação";
    const resumo = caso.resumo || "sem resumo";

    const detalhes: ResultadoAviso["detalhes"] = [];
    for (const p of alvos) {
      // CLAIM antes de enviar: se duas entregas do webhook rodarem juntas, só
      // uma insere e só uma manda a mensagem.
      const { data: claim } = await admin
        .from("support_alertas")
        .upsert(
          { handoff_id: caso.id, telefone: p.telefone, ok: false },
          { onConflict: "handoff_id,telefone", ignoreDuplicates: true }
        )
        .select("id");
      if (!claim || claim.length === 0) continue;

      const envio = await sendWhatsappTemplate(p.telefone, template, idioma, [
        motivo,
        cliente,
        resumo,
      ]);
      await admin
        .from("support_alertas")
        .update({ ok: envio.ok, erro: envio.ok ? null : (envio.error ?? "falha") })
        .eq("id", claim[0].id);
      detalhes.push({ telefone: p.telefone, ok: envio.ok, erro: envio.error });
    }

    return {
      enviados: detalhes.filter((d) => d.ok).length,
      falhas: detalhes.filter((d) => !d.ok).length,
      detalhes,
    };
  } catch {
    return VAZIO;
  }
}
