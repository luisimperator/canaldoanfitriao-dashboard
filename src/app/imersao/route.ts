import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { escolherTurmaImersao } from "@/lib/imersao-escolha";
import { paginaAviso } from "@/lib/imersao-pagina";
import { responderSala, turmasParaImersao } from "@/lib/imersao-sala";

// Link fixo da sala do evento: link.canaldoanfitriao.com.br/imersao
//
// Primeiro as turmas antigas (codigo IS NULL); turma ativa = a de turma_data mais
// próxima com fim_domingo >= agora. Sem turma antiga em andamento: 302 pro
// /i/<codigo> da turma com codigo ativa mais próxima (o obrigado da Eduzz e
// textos antigos apontam pra cá; Gusta 27/11).
//  - sábado, de 30 min antes do início até o fim: 302 pra sala_url_sabado;
//  - domingo, idem, pra sala_url_domingo;
//  - fora disso: página curta dizendo quando a sala abre (atualiza sozinha);
//  - nenhuma turma ativa no futuro, mas alguma já terminada: "turma encerrada".
// Repassa UTMs e, se vierem na URL, nome/e-mail/telefone pra sala.
// Cada acesso vira um clique em imersao_cliques (funil por turma).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const agora = new Date();

  if (!supabase) {
    return paginaAviso("Sala indisponível", ["Tente de novo em alguns minutos."]);
  }

  const escolha = escolherTurmaImersao(await turmasParaImersao(supabase), agora);
  return responderSala(req, supabase, escolha, agora);
}
