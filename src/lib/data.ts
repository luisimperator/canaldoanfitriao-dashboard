// Camada de acesso a dados.
// Com NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY definidos,
// lê do Supabase (tabelas em supabase/migrations/0001_schema.sql).
// Sem credenciais, cai no modo demo com dados gerados.

import { createClient } from "@supabase/supabase-js";
import { generateDemoData } from "./demo-data";
import type {
  AdSpend,
  DashboardData,
  FinCategory,
  FinTransaction,
  Lead,
  Sale,
  Seller,
} from "./types";

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// O Supabase devolve no máximo 1000 linhas por consulta; com o histórico
// completo de vendas é preciso paginar até varrer a tabela inteira.
const PAGE = 1000;

async function selectAll(
  supabase: ReturnType<typeof getSupabase>,
  table: string,
  columns: string,
  orderBy = "id"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`Erro ao consultar o Supabase (${table}): ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!supabaseConfigured()) {
    return generateDemoData();
  }

  const supabase = getSupabase();
  const [sellers, leads, sales, adSpend, finCategories, finTransactions] =
    await Promise.all([
      selectAll(supabase, "sellers", "id, name, is_active"),
      selectAll(
        supabase,
        "leads",
        "id, created_at, source, status, seller_id, pipeline_stage, name, phone, extra"
      ),
      selectAll(supabase, "sales", "id, sale_date, amount, seller_id, product, status, utm"),
      selectAll(supabase, "ad_spend", "date, platform, amount", "date"),
      selectAll(supabase, "fin_categories", "id, group_name, name"),
      selectAll(
        supabase,
        "fin_transactions",
        "id, transaction_date, amount, direction, description, counterparty, category_id"
      ),
    ]);

  return {
    sellers: sellers.map(
      (r): Seller => ({ id: r.id, name: r.name, isActive: r.is_active })
    ),
    leads: leads.map(
      (r): Lead => ({
        id: r.id,
        createdAt: String(r.created_at).slice(0, 10),
        source: r.source,
        status: r.status,
        sellerId: r.seller_id,
        pipelineStage: r.pipeline_stage,
        name: r.name,
        phone: r.phone,
        extra: r.extra,
      })
    ),
    sales: sales.map(
      (r): Sale => ({
        id: r.id,
        saleDate: String(r.sale_date).slice(0, 10),
        amount: Number(r.amount),
        sellerId: r.seller_id,
        product: r.product,
        status: r.status,
        utm: r.utm,
      })
    ),
    adSpend: adSpend.map(
      (r): AdSpend => ({ date: String(r.date), platform: r.platform, amount: Number(r.amount) })
    ),
    finCategories: finCategories.map(
      (r): FinCategory => ({ id: r.id, groupName: r.group_name, name: r.name })
    ),
    finTransactions: finTransactions.map(
      (r): FinTransaction => ({
        id: r.id,
        transactionDate: String(r.transaction_date),
        amount: Number(r.amount),
        direction: r.direction,
        description: r.description,
        counterparty: r.counterparty,
        categoryId: r.category_id,
      })
    ),
    isDemo: false,
  };
}
