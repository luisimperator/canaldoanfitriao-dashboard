import type { SupabaseClient } from "@supabase/supabase-js";
import { historico, imersaoPendente } from "@/lib/teo";

// Modo Black: quem escreve pro WhatsApp do Canal entra no Téo. A automação
// "Téo: entrada" do Unnichat chama o webhook com ?etapa=teo-entrada a cada
// mensagem recebida; a fila chama esta função (e não o processamento normal
// do lead, pra não mexer na etapa do funil).
//
// - Fora da Black (teo_config.black_ate vencido ou vazio), não faz nada.
// - Contato novo no Téo: entra como "novo" (a janela está aberta, então o
//   Téo responde a mensagem dele).
// - Conversa encerrada (sem resposta) ou parada no limite: volta pro Téo.
// - Conversa com vendedor (humano por call, vendedor, suporte…): fica onde está,
//   a não ser que esse contato seja antigo (DONO_RECENTE_DIAS): a venda é de
//   quem está vendendo agora (Fernando, 14/11: "o Breno conversou com ele 2
//   meses atrás, dane-se, agora a venda é do Téo").
// - Conversa atribuída ao Diego: o Téo não entra.
// - Comprador da Imersão, até o domingo da turma: o Téo não entra (Fernando,
//   25/11: "Quem compra imersão tem que só fazer a imersão, não tem que fazer
//   call"); se estava com o Téo, sai.
const DONO_RECENTE_DIAS = 15;

// O vendedor ainda está com o lead? Só se a passagem pro time é recente, ou se
// alguém do time escreveu (mensagem digitada) ou tem call com ele nos últimos
// DONO_RECENTE_DIAS. Conversa com o Diego nunca volta.
async function vendedorRecente(supabase: SupabaseClient, id: string, desdeHumano: string | null): Promise<boolean> {
  const limite = Date.now() - DONO_RECENTE_DIAS * 86400_000;
  if (!desdeHumano || new Date(desdeHumano).getTime() >= limite) return true;
  return vendedorFalouRecente(supabase, id);
}

// Alguém do time escreveu (mensagem digitada) ou tem call com o lead nos
// últimos DONO_RECENTE_DIAS? Conversa com o Diego conta como sim.
async function vendedorFalouRecente(supabase: SupabaseClient, id: string): Promise<boolean> {
  const limite = Date.now() - DONO_RECENTE_DIAS * 86400_000;
  const { data: calls } = await supabase
    .from("teo_calls")
    .select("id")
    .eq("contact_id", id)
    .neq("status", "cancelada")
    .gte("inicio", new Date(limite).toISOString())
    .limit(1);
  if (calls?.length) return true;
  const dono = await supabase.rpc("teo_unnichat", { p_method: "GET", p_path: `/contact/${id}/assign`, p_body: null });
  const atual = ((dono.data as { body?: { data?: { name?: string } | null } } | null)?.body?.data?.name ?? "") as string;
  if (/diego/i.test(atual)) return true;
  const msgs = await historico(supabase, id).catch(() => null);
  if (!msgs) return true; // na dúvida, fica com o vendedor
  return msgs.some(
    (m) =>
      m.senderBy === "user" &&
      !m.origin &&
      ["message", "audio", "image", "document", "video"].includes(m.type) &&
      new Date(m.date).getTime() >= limite
  );
}

// Resposta aos avisos de atraso dos grupos (migração 0139): quem recebeu
// atraso_1/3/6 nos últimos 10 dias e tocou em "Quero regularizar" ganha a 2ª
// via; em "Não quero renovar", para de receber aviso e sai do grupo na próxima
// consulta do Foley. O painel trata e o Téo não entra. Qualquer outra mensagem
// segue o caminho de sempre.
async function respostaAvisoAtraso(
  supabase: SupabaseClient,
  contato: { id?: string; phoneNumber?: string; lastMessage?: string } | undefined
): Promise<boolean> {
  const texto = contato?.lastMessage?.trim();
  if (!contato?.id || !contato.phoneNumber || !texto || texto.length > 60) return false;
  const { data, error } = await supabase.rpc("foley_botao", {
    p_contact_id: contato.id,
    p_phone: contato.phoneNumber,
    p_texto: texto,
  });
  if (error) throw new Error(`foley_botao: ${error.message}`);
  return ((data as { acao?: string } | null)?.acao ?? "nada") !== "nada";
}

export async function inscreverEntrada(
  supabase: SupabaseClient,
  body: unknown
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const contato = (body as { contact?: { id?: string; name?: string; phoneNumber?: string; lastMessage?: string } } | null)
    ?.contact;
  const id = contato?.id;
  if (!id) return { ok: true };
  if (await respostaAvisoAtraso(supabase, contato)) return { ok: true };
  const { data: cfg } = await supabase.from("teo_config").select("black_ate, ligado, vendedores").eq("id", 1).maybeSingle();
  if (!cfg?.ligado || !cfg.black_ate || new Date(cfg.black_ate).getTime() < Date.now()) return { ok: true };

  const turmaImersao = await imersaoPendente(supabase, contato?.phoneNumber ?? null);
  if (turmaImersao) {
    const { data: saiu } = await supabase
      .from("teo_conversas")
      .update({ estado: "encerrado", motivo_humano: "imersao", proxima_checagem: null, atualizado_em: new Date().toISOString() })
      .eq("contact_id", id)
      .in("estado", ["novo", "em_conversa"])
      .select("contact_id");
    if (saiu?.length) {
      await supabase.from("webhook_log").insert({
        source: "teo",
        note: "comprador da Imersão: o Téo sai",
        body: { contact_id: id, nome: contato?.name ?? null, turma: turmaImersao },
      });
    }
    return { ok: true };
  }

  const { data: ja } = await supabase
    .from("teo_conversas")
    .select("estado, motivo_humano, atualizado_em")
    .eq("contact_id", id)
    .maybeSingle();
  if (ja) {
    if (ja.estado === "encerrado" || (ja.estado === "humano" && ja.motivo_humano === "limite")) {
      await supabase
        .from("teo_conversas")
        .update({ estado: "em_conversa", motivo_humano: null, proxima_checagem: null, ativo: true, atualizado_em: new Date().toISOString() })
        .eq("contact_id", id);
      await supabase.from("webhook_log").insert({ source: "teo", note: "entrada: voltou pro Téo", body: { contact_id: id, nome: contato?.name ?? null } });
    } else if (ja.estado === "humano" && !(await vendedorRecente(supabase, id, ja.atualizado_em as string | null))) {
      await supabase
        .from("teo_conversas")
        .update({
          estado: "em_conversa",
          motivo_humano: null,
          black_passou_em: null,
          black_vendedor: null,
          black_retomou_em: null,
          followup_etapa: 0,
          silencio_desde: null,
          followup_em: null,
          proxima_checagem: null,
          ativo: true,
          atualizado_em: new Date().toISOString(),
        })
        .eq("contact_id", id);
      await supabase.from("webhook_log").insert({
        source: "teo",
        note: `entrada: voltou pro Téo (vendedor sem contato há ${DONO_RECENTE_DIAS}+ dias)`,
        body: { contact_id: id, nome: contato?.name ?? null, motivo_antes: ja.motivo_humano ?? null },
      });
    } else if (ja.estado !== "humano") {
      // Já está com o Téo: só garante que a mensagem nova seja lida agora.
      await supabase.from("teo_conversas").update({ proxima_checagem: null }).eq("contact_id", id);
    }
    return { ok: true };
  }

  const dono = await supabase.rpc("teo_unnichat", { p_method: "GET", p_path: `/contact/${id}/assign`, p_body: null });
  const donoData = (dono.data as { body?: { data?: { id?: string; name?: string } | null } } | null)?.body?.data ?? null;
  const atual = (donoData?.name ?? "") as string;
  if (/diego/i.test(atual)) return { ok: true };
  // Primeira vez no Téo, mas o vendedor a quem o contato está atribuído falou
  // com ele (ou tem call) nos últimos DONO_RECENTE_DIAS: fica com o vendedor,
  // como na conversa que já existia (a regra valia só pra quem já estava no Téo).
  // Só vendedor ativo (teo_config.vendedores): quem saiu do time não segura o lead.
  const vendedores = ((cfg as { vendedores?: { atendente_id?: string }[] | null }).vendedores ?? []) as { atendente_id?: string }[];
  const comVendedor =
    Boolean(donoData?.id) &&
    vendedores.some((v) => v.atendente_id === donoData?.id) &&
    (await vendedorFalouRecente(supabase, id));

  const { error } = await supabase.from("teo_conversas").insert({
    contact_id: id,
    nome: contato?.name ?? null,
    telefone: contato?.phoneNumber ?? null,
    estado: comVendedor ? "humano" : "novo",
    ...(comVendedor ? { motivo_humano: "vendedor" } : {}),
  });
  if (error && !/duplicate|unique/i.test(error.message)) return { ok: false, erro: error.message };
  if (!error) {
    await supabase.from("webhook_log").insert({
      source: "teo",
      note: comVendedor ? "entrada: fica com o vendedor (falou nos últimos 15 dias)" : "inscrito (entrada)",
      body: { contact_id: id, nome: contato?.name ?? null, estava_com: atual || null },
    });
  }
  return { ok: true };
}
