import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { registrarClique, repassarParams, turmaParaCompra } from "@/lib/imersao";
import { paginaAviso } from "@/lib/imersao-pagina";

// Botão "Garantir meu ingresso" da LP: registra o clique (funil da turma) e
// manda pro checkout da Eduzz (IMERSAO_CHECKOUT_URL) com as UTMs da visita —
// é por elas que a venda chega no webhook com a origem e o comprador aparece
// com utm_* no painel.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const checkout = process.env.IMERSAO_CHECKOUT_URL?.trim() || null;
  const destino = checkout ? repassarParams(params, checkout) : null;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await registrarClique(supabase, { headers: req.headers, params }, {
      rota: "checkout",
      turma_data: turmaParaCompra(new Date()),
      momento: destino ? "checkout" : "sem_checkout",
      destino,
      variante: params.get("v") === "curta" ? "curta" : "longa",
    });
  }

  if (!destino) {
    return paginaAviso("As vendas abrem em instantes", [
      "Estamos terminando de liberar o checkout. Esta página atualiza sozinha.",
    ]);
  }
  return NextResponse.redirect(destino, 302);
}
