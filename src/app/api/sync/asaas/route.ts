import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  fetchAsaasCustomers,
  fetchAsaasPaymentsByPaymentDate,
  getAsaasConfig,
} from "@/lib/integrations/asaas";

// Sync do Asaas → banco, e casamento com a venda de origem na Eduzz.
//
// A chave do Asaas fica só na Vercel (ASAAS_API_KEY) — quem fala com eles é o
// app. Esta rota é chamada pelo cron do Supabase com ?key=, comparada com o
// segredo asaas_sync_key do Vault (mesmo padrão do sync do Inter).
//
// GET /api/sync/asaas?key=...&dias=120

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const { data: esperado } = await admin.rpc("asaas_sync_key");
  const key = req.nextUrl.searchParams.get("key");
  if (!esperado || key !== esperado) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const cfg = getAsaasConfig();
  if (!cfg) {
    return NextResponse.json({ error: "ASAAS_API_KEY não configurada." }, { status: 503 });
  }

  const dias = Math.min(Number(req.nextUrl.searchParams.get("dias") ?? 120) || 120, 730);
  const ate = new Date().toISOString().slice(0, 10);
  const de = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

  try {
    const [clientes, cobrancas] = await Promise.all([
      fetchAsaasCustomers(cfg),
      fetchAsaasPaymentsByPaymentDate(cfg, de, ate),
    ]);

    if (clientes.length > 0) {
      const { error } = await admin.from("asaas_clientes").upsert(
        clientes.map((c) => ({
          id: c.id,
          nome: c.name ?? null,
          email: c.email ?? null,
          documento: c.cpfCnpj ?? null,
          celular: c.mobilePhone ?? null,
          raw: c,
          synced_at: new Date().toISOString(),
        })),
        { onConflict: "id" }
      );
      if (error) throw new Error(`clientes: ${error.message}`);
    }

    if (cobrancas.length > 0) {
      const { error } = await admin.from("asaas_cobrancas").upsert(
        cobrancas.map((p) => ({
          id: p.id,
          cliente_id: p.customer ?? null,
          valor: p.value ?? 0,
          valor_liquido: p.netValue ?? null,
          status: p.status ?? null,
          billing_type: p.billingType ?? null,
          descricao: p.description ?? null,
          numero_fatura: p.invoiceNumber ?? null,
          due_date: p.dueDate ?? null,
          payment_date: p.paymentDate ?? null,
          credit_date: p.creditDate ?? p.estimatedCreditDate ?? null,
          raw: p,
          synced_at: new Date().toISOString(),
        })),
        { onConflict: "id" }
      );
      if (error) throw new Error(`cobranças: ${error.message}`);
    }

    // Casa o que dá e devolve o que casou (o resto fica em asaas_sem_vendedor).
    const { data: casados, error: erroCasar } = await admin.rpc("casar_asaas_com_vendas", {
      p_dias: 90,
    });
    if (erroCasar) throw new Error(`casamento: ${erroCasar.message}`);

    return NextResponse.json({
      ok: true,
      clientes: clientes.length,
      cobrancas: cobrancas.length,
      atribuidas: casados ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "erro desconhecido" },
      { status: 500 }
    );
  }
}
