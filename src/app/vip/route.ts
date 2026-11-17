import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { diaSP, ehSabado, registrarClique, somaDias, turmaParaCompra, turmaPorData } from "@/lib/imersao";
import { diaHumano, paginaAviso } from "@/lib/imersao-pagina";

// Link fixo do grupo de avisos da turma: link.canaldoanfitriao.com.br/vip
//
// Vai na página de obrigado da Eduzz e nos e-mails. Qual turma:
//  1. ?turma=AAAA-MM-DD, se vier (ex.: link do e-mail com a turma);
//  2. a turma do comprador, se vier ?email= e ele estiver em imersao_compradores;
//  3. senão, a turma de quem compra agora (próximo sábado que ainda não começou)
//     — o caso de quem acabou de pagar.
// Grupo cheio (grupo_vip_cheio) manda pro reserva (grupo_vip_url_2).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const params = req.nextUrl.searchParams;
  if (!supabase) return paginaAviso("Grupo indisponível", ["Tente de novo em alguns minutos."]);

  let turmaData: string | null = null;
  const pedida = (params.get("turma") ?? "").trim();
  if (ehSabado(pedida)) turmaData = pedida;

  const email = (params.get("email") ?? "").trim().toLowerCase();
  if (!turmaData && email) {
    const { data } = await supabase
      .from("imersao_compradores")
      .select("turma_data")
      .eq("email", email)
      .eq("status", "pago")
      .gte("turma_data", somaDias(diaSP(new Date()), -1))
      .order("turma_data", { ascending: true })
      .limit(1);
    turmaData = (data?.[0]?.turma_data as string | undefined) ?? null;
  }
  if (!turmaData) turmaData = turmaParaCompra(new Date());

  const turma = await turmaPorData(supabase, turmaData);
  const principal = turma?.grupo_vip_url?.trim() || null;
  const reserva = turma?.grupo_vip_url_2?.trim() || null;
  const usaReserva = !!reserva && (turma?.grupo_vip_cheio || !principal);
  const destino = usaReserva ? reserva : principal;

  await registrarClique(supabase, { headers: req.headers, params }, {
    rota: "vip",
    turma_data: turma ? turmaData : null,
    momento: destino ? (usaReserva ? "grupo_2" : "grupo") : "sem_grupo",
    destino,
  });

  if (!destino) {
    return paginaAviso(
      "O grupo da sua turma abre em breve",
      [
        `Sua turma é a de ${diaHumano(`${turmaData}T15:00:00Z`)}.`,
        "Assim que o grupo de avisos estiver no ar, o link chega no seu e-mail. Esta página atualiza sozinha.",
      ]
    );
  }
  return NextResponse.redirect(destino, 302);
}
