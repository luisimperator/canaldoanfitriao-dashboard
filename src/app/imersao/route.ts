import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { escolherTurmaImersao } from "@/lib/imersao-escolha";
import { paginaAviso } from "@/lib/imersao-pagina";
import { responderSala, turmasSemCodigo } from "@/lib/imersao-sala";

// Link fixo da sala do evento: link.canaldoanfitriao.com.br/imersao
//
// Só turmas antigas (codigo IS NULL); turma com codigo tem o link próprio
// /i/<codigo>. Turma ativa = a de turma_data mais próxima com fim_domingo >= agora.
//  - sábado, de 30 min antes do início até o fim: 302 pra sala_url_sabado;
//  - domingo, idem, pra sala_url_domingo;
//  - fora disso: página curta dizendo quando a sala abre (atualiza sozinha);
//  - sem turma ativa, mas com turma antiga já terminada: "turma encerrada".
// Repassa UTMs e, se vierem na URL, nome/e-mail/telefone pra sala.
// Cada acesso vira um clique em imersao_cliques (funil por turma).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const agora = new Date();

  if (!supabase) {
    return paginaAviso("Sala indisponível", ["Tente de novo em alguns minutos."]);
  }

  const escolha = escolherTurmaImersao(await turmasSemCodigo(supabase), agora);
  return responderSala(req, supabase, escolha, agora);
}
