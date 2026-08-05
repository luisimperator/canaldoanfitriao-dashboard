import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAccess } from "@/lib/supabase-server";
import { canAccess } from "@/lib/access";

// CSV dos lançamentos do período — o mesmo recorte que a Visão geral mostra na
// tela, lendo os mesmos ?from/?to. "Exportar" tem que bater com o que está
// escrito no dashboard, senão vira duas verdades.
//
// GET /api/export/financeiro?from=YYYY-MM-DD&to=YYYY-MM-DD

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COLUNAS = [
  "data",
  "ano_mes",
  "direcao",
  "valor",
  "valor_com_sinal",
  "grupo",
  "categoria",
  "papel_no_resultado",
  "contraparte",
  "descricao",
  "classificacao",
];

function esc(v: string): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const access = await getAccess();
  if (!access.authed || !canAccess("/financeiro/visao-geral", access)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const re = /^\d{4}-\d{2}-\d{2}$/;
  const hoje = new Date().toISOString().slice(0, 10);
  const spTo = req.nextUrl.searchParams.get("to");
  const spFrom = req.nextUrl.searchParams.get("from");
  const ate = spTo && re.test(spTo) ? spTo : hoje;
  const de = spFrom && re.test(spFrom) ? spFrom : `${hoje.slice(0, 7)}-01`;

  const { data: cats } = await admin
    .from("fin_categories")
    .select("id, group_name, name, kind");
  const porId = new Map(
    (cats ?? []).map((c) => [c.id as string, c as { group_name: string; name: string; kind: string }])
  );

  // Paginado: o extrato inteiro passa de 1000 linhas e o Supabase corta aí.
  const PAGINA = 1000;
  type Row = {
    transaction_date: string;
    amount: number;
    direction: string;
    description: string | null;
    counterparty: string | null;
    category_id: string | null;
    category_source: string | null;
  };
  const linhas: Row[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await admin
      .from("fin_transactions")
      .select(
        "transaction_date, amount, direction, description, counterparty, category_id, category_source"
      )
      .gte("transaction_date", de)
      .lte("transaction_date", ate)
      .order("transaction_date", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const page = (data ?? []) as Row[];
    linhas.push(...page);
    if (page.length < PAGINA || inicio > 100_000) break;
  }

  const out = [COLUNAS.join(",")];
  for (const r of linhas) {
    const c = r.category_id ? porId.get(r.category_id) : undefined;
    const valor = Number(r.amount).toFixed(2);
    out.push(
      [
        r.transaction_date.slice(0, 10),
        r.transaction_date.slice(0, 7),
        r.direction,
        valor,
        (r.direction === "out" ? "-" : "") + valor,
        c?.group_name ?? "(sem grupo)",
        c?.name ?? "(sem categoria)",
        c?.kind ?? "",
        r.counterparty ?? "",
        r.description ?? "",
        r.category_source === "manual" ? "manual" : "regra",
      ]
        .map(esc)
        .join(",")
    );
  }

  // BOM na frente pro Excel abrir o UTF-8 com acento certo.
  const csv = "﻿" + out.join("\n") + "\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lancamentos_${de}_a_${ate}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
