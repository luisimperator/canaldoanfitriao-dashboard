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

export async function getDashboardData(): Promise<DashboardData> {
  if (!supabaseConfigured()) {
    return generateDemoData();
  }

  const supabase = getSupabase();
  const [sellers, leads, sales, adSpend, finCategories, finTransactions] =
    await Promise.all([
      supabase.from("sellers").select("id, name, is_active"),
      supabase.from("leads").select("id, created_at, source, status, seller_id"),
      supabase.from("sales").select("id, sale_date, amount, seller_id, product, status"),
      supabase.from("ad_spend").select("date, platform, amount"),
      supabase.from("fin_categories").select("id, group_name, name"),
      supabase
        .from("fin_transactions")
        .select("id, transaction_date, amount, direction, description, counterparty, category_id"),
    ]);

  const firstError =
    sellers.error ?? leads.error ?? sales.error ?? adSpend.error ??
    finCategories.error ?? finTransactions.error;
  if (firstError) {
    throw new Error(`Erro ao consultar o Supabase: ${firstError.message}`);
  }

  return {
    sellers: (sellers.data ?? []).map(
      (r): Seller => ({ id: r.id, name: r.name, isActive: r.is_active })
    ),
    leads: (leads.data ?? []).map(
      (r): Lead => ({
        id: r.id,
        createdAt: String(r.created_at).slice(0, 10),
        source: r.source,
        status: r.status,
        sellerId: r.seller_id,
      })
    ),
    sales: (sales.data ?? []).map(
      (r): Sale => ({
        id: r.id,
        saleDate: String(r.sale_date).slice(0, 10),
        amount: Number(r.amount),
        sellerId: r.seller_id,
        product: r.product,
        status: r.status,
      })
    ),
    adSpend: (adSpend.data ?? []).map(
      (r): AdSpend => ({ date: String(r.date), platform: r.platform, amount: Number(r.amount) })
    ),
    finCategories: (finCategories.data ?? []).map(
      (r): FinCategory => ({ id: r.id, groupName: r.group_name, name: r.name })
    ),
    finTransactions: (finTransactions.data ?? []).map(
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
