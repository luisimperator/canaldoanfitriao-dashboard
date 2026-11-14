import type { SupabaseClient } from "@supabase/supabase-js";
import { historico } from "@/lib/teo";

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
const DONO_RECENTE_DIAS = 30;

// O vendedor ainda está com o lead? Só se a passagem pro time é recente, ou se
// alguém do time escreveu (mensagem digitada) ou tem call com ele nos últimos
// DONO_RECENTE_DIAS. Conversa com o Diego nunca volta.
async function vendedorRecente(supabase: SupabaseClient, id: string, desdeHumano: string | null): Promise<boolean> {
  const limite = Date.now() - DONO_RECENTE_DIAS * 86400_000;
  if (!desdeHumano || new Date(desdeHumano).getTime() >= limite) return true;
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

export async function inscreverEntrada(
  supabase: SupabaseClient,
  body: unknown
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const contato = (body as { contact?: { id?: string; name?: string; phoneNumber?: string } } | null)?.contact;
  const id = contato?.id;
  if (!id) return { ok: true };
  const { data: cfg } = await supabase.from("teo_config").select("black_ate, ligado").eq("id", 1).maybeSingle();
  if (!cfg?.ligado || !cfg.black_ate || new Date(cfg.black_ate).getTime() < Date.now()) return { ok: true };

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
        note: "entrada: voltou pro Téo (vendedor sem contato há 30+ dias)",
        body: { contact_id: id, nome: contato?.name ?? null, motivo_antes: ja.motivo_humano ?? null },
      });
    } else if (ja.estado !== "humano") {
      // Já está com o Téo: só garante que a mensagem nova seja lida agora.
      await supabase.from("teo_conversas").update({ proxima_checagem: null }).eq("contact_id", id);
    }
    return { ok: true };
  }

  const dono = await supabase.rpc("teo_unnichat", { p_method: "GET", p_path: `/contact/${id}/assign`, p_body: null });
  const atual = ((dono.data as { body?: { data?: { name?: string } | null } } | null)?.body?.data?.name ?? "") as string;
  if (/diego/i.test(atual)) return { ok: true };

  const { error } = await supabase.from("teo_conversas").insert({
    contact_id: id,
    nome: contato?.name ?? null,
    telefone: contato?.phoneNumber ?? null,
    estado: "novo",
  });
  if (error && !/duplicate|unique/i.test(error.message)) return { ok: false, erro: error.message };
  if (!error) {
    await supabase.from("webhook_log").insert({ source: "teo", note: "inscrito (entrada)", body: { contact_id: id, nome: contato?.name ?? null, estava_com: atual || null } });
  }
  return { ok: true };
}
