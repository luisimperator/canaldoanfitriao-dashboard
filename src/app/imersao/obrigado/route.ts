import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { turmaParaCompra } from "@/lib/imersao";
import { escolherTurmaAVenda, type TurmaVendivel } from "@/lib/imersao-escolha";
import { paginaAviso } from "@/lib/imersao-pagina";

// Obrigado da Eduzz da Imersão (cartão, Pix e boleto do produto 3153362):
// link.canaldoanfitriao.com.br/imersao/obrigado
//
// 302 (com a query inteira) pro /i/<codigo> da turma À VENDA agora: a de
// turma_data mais próxima, ativa, cujo corte (inicio_sabado = sábado 10h SP)
// ainda não passou. Vira sozinho no sábado 10h, sem trocar URL na Eduzz
// (Gusta, 27/11). O clique do funil fica por conta do /i/<codigo>.
// Sem turma à venda com codigo cadastrada (ex.: a do sábado seguinte ainda não
// criada): página curta de compra confirmada, sem contato, e alerta em
// webhook_log (source "imersao_obrigado") + log de erro.

export const dynamic = "force-dynamic";

function confirmada(): Response {
  return paginaAviso("Compra confirmada!", ["Você vai receber o link da sua turma por e-mail e WhatsApp."], {
    recarregar: false,
  });
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const agora = new Date();

  if (!supabase) {
    console.error("[imersao/obrigado] sem Supabase: mostrando compra confirmada");
    return confirmada();
  }

  const { data } = await supabase
    .from("imersao_turmas")
    .select("turma_data, inicio_sabado, ativa, codigo")
    .order("turma_data", { ascending: true });
  const escolha = escolherTurmaAVenda((data as TurmaVendivel[] | null) ?? [], agora);

  if (escolha.tipo === "redireciona" && escolha.turma.codigo) {
    const destino = req.nextUrl.clone();
    destino.pathname = `/i/${encodeURIComponent(escolha.turma.codigo)}`;
    return NextResponse.redirect(destino, 302);
  }

  const detalhe = {
    agora: agora.toISOString(),
    turma_esperada: turmaParaCompra(agora),
    turma_a_venda_sem_codigo: escolha.turma?.turma_data ?? null,
    utm_source: req.nextUrl.searchParams.get("utm_source"),
  };
  console.error("[imersao/obrigado] ALERTA sem turma à venda com codigo", JSON.stringify(detalhe));
  try {
    await supabase.from("webhook_log").insert({ source: "imersao_obrigado", note: "sem turma à venda", body: detalhe });
  } catch {
    /* alerta é best-effort: a página sai de qualquer jeito */
  }
  return confirmada();
}
