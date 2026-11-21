import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { escolherTurmaPorCodigo } from "@/lib/imersao-escolha";
import { paginaAviso } from "@/lib/imersao-pagina";
import { responderSala, turmasPorCodigo } from "@/lib/imersao-sala";

// Link da sala de UMA turma: link.canaldoanfitriao.com.br/i/<codigo>
//
// Mesmo comportamento do /imersao (espera com contagem, 302 pras salas, repasse
// de UTMs e dados do participante, clique em imersao_cliques), mas sempre preso
// à turma de imersao_turmas.codigo = <codigo> (exato, case-sensitive).
// Codigo inexistente: 404 sem detalhe. Depois do fim_domingo: "turma encerrada".

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const supabase = getSupabaseAdmin();
  const agora = new Date();

  if (!supabase) {
    return paginaAviso("Sala indisponível", ["Tente de novo em alguns minutos."]);
  }

  const escolha = escolherTurmaPorCodigo(await turmasPorCodigo(supabase, codigo), codigo, agora);
  return responderSala(req, supabase, escolha, agora);
}
