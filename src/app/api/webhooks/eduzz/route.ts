import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Webhook da Eduzz.
// Cadastre https://SEU_DOMINIO/api/webhooks/eduzz?key=EDUZZ_WEBHOOK_KEY no painel.
//
// Comportamento:
//  - CAIXA-PRETA: registra TODO evento recebido em webhook_log (source='eduzz'),
//    inclusive os novos (cart_abandonment, contract_*, ciclo de vida de fatura,
//    etc.), para mapearmos o formato real antes de construir o tratamento de cada um.
//  - SÓ `myeduzz.invoice_paid` vira/atualiza uma venda em `sales`.
//  - `myeduzz.invoice_refunded` e `myeduzz.invoice_chargeback` atualizam o status.
//  - Os demais eventos por ora ficam apenas no log (action: "logged").
//
// (Correção: antes, QUALQUER evento de fatura com id — invoice_opened,
//  invoice_recovering, etc. — era gravado como "paga", inflando o faturamento.)

// Remove acentos (marcas diacríticas combinantes U+0300–U+036F) sem usar regex
// com escape \u, evitando ambiguidades de escaping na ferramenta de edição.
function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .split("")
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code < 0x300 || code > 0x36f;
    })
    .join("");
}

// Dia-calendário de São Paulo de um timestamp. O paidAt vem em UTC; fatiar
// direto jogava vendas feitas depois das 21h (horário local) no dia seguinte,
// bagunçando "vendas hoje" e a série diária.
function spDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export async function POST(req: NextRequest) {
  const expectedKey = process.env.EDUZZ_WEBHOOK_KEY;
  if (!expectedKey) {
    return NextResponse.json(
      { error: "EDUZZ_WEBHOOK_KEY não configurada no servidor." },
      { status: 501 }
    );
  }
  if (req.nextUrl.searchParams.get("key") !== expectedKey) {
    return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  // Pings de verificação chegam sem corpo: responde 200 para ativar a URL.
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, action: "ping" });
  }
  const event: string = body.event ?? "";
  const data = body.data ?? {};

  // CAIXA-PRETA: registra todo evento (até os sem id) para mapear o formato real.
  await supabase
    .from("webhook_log")
    .insert({ source: "eduzz", note: event || "(sem event)", body });

  const invoiceId = String(data.id ?? data.invoice_id ?? "");

  // Reembolso / chargeback: atualizam o status de uma venda já existente.
  if (event === "myeduzz.invoice_refunded") {
    if (invoiceId) {
      await supabase.from("sales").update({ status: "reembolsada" }).eq("eduzz_invoice_id", invoiceId);
    }
    return NextResponse.json({ ok: true, action: "refunded" });
  }
  if (event === "myeduzz.invoice_chargeback") {
    if (invoiceId) {
      await supabase.from("sales").update({ status: "chargeback" }).eq("eduzz_invoice_id", invoiceId);
    }
    return NextResponse.json({ ok: true, action: "chargeback" });
  }

  // Só FATURA PAGA vira venda. Demais eventos ficam apenas no log por enquanto.
  if (event !== "myeduzz.invoice_paid") {
    return NextResponse.json({ ok: true, action: "logged", event });
  }
  if (!invoiceId) {
    return NextResponse.json({ ok: true, action: "ping" });
  }

  // --- Fatura paga: registra/atualiza a venda ---
  // Valor pago COM juros de parcelamento (mesma base do histórico importado
  // dos CSVs — coluna "Valor Total da Venda"). Cai para o preço do produto
  // só se o valor pago não vier no payload.
  const amount = Number(
    data.paid?.value ?? data.price?.paid?.value ?? data.price?.value ?? data.value ?? 0
  );
  const saleDate = spDay(String(data.paidAt ?? data.createdAt ?? new Date().toISOString()));
  const product = String(data.items?.[0]?.name ?? data.product?.name ?? "Canal do Anfitrião");

  // UTMs vêm em campos diferentes conforme a versão do payload; guarda o que houver.
  const utm = data.utm ?? data.tracker ?? data.utmParameters ?? null;

  // O vendedor é atribuído cruzando com o lead do Unnichat (por e-mail),
  // ou pelo nome no utm_source (links individuais dos vendedores).
  const buyerEmail: string | null = data.buyer?.email ?? data.student?.email ?? null;
  const buyerDocument: string | null = data.buyer?.document ?? data.student?.document ?? null;
  const buyerName: string | null = data.buyer?.name ?? data.student?.name ?? null;
  let sellerId: string | null = null;
  let leadId: string | null = null;
  if (buyerEmail) {
    // Match case-insensitive (ilike com o padrão escapado = igualdade ignorando
    // caixa; "_" e "%" são curingas de LIKE e "_" é comum em e-mail) e
    // tolerante a e-mail duplicado: antes o maybeSingle() falhava em silêncio
    // quando havia 2+ leads com o mesmo e-mail e a venda ficava sem lead.
    // Preferimos o lead que já tem vendedor; senão, o mais recente.
    const { data: matches } = await supabase
      .from("leads")
      .select("id, seller_id, extra")
      .ilike("email", buyerEmail.replace(/[\\%_]/g, "\\$&"))
      .order("updated_at", { ascending: false })
      .limit(10);
    const lead = (matches ?? []).find((l) => l.seller_id) ?? (matches ?? [])[0] ?? null;
    if (lead) {
      leadId = lead.id;
      sellerId = lead.seller_id;
      // Adiciona tags do que a Eduzz mandou (compra) no lead, sem apagar as
      // que já existem: marca como cliente e guarda o produto comprado.
      const extra = (lead.extra ?? {}) as Record<string, unknown>;
      const curTags = Array.isArray(extra.tags) ? (extra.tags as unknown[]).map(String) : [];
      const tags = Array.from(new Set([...curTags, "cliente", `comprou:${product}`]));
      await supabase
        .from("leads")
        .update({ status: "convertido", extra: { ...extra, tags } })
        .eq("id", lead.id);
    }
  }
  if (!sellerId && utm) {
    const utmSource = String(utm.source ?? utm.utm_source ?? "").toLowerCase();
    if (utmSource) {
      const { data: sellers } = await supabase
        .from("sellers")
        .select("id, name")
        .eq("is_active", true);
      const match = (sellers ?? []).find((s) =>
        utmSource.includes(semAcento(s.name.split(" ")[0].toLowerCase()))
      );
      sellerId = match?.id ?? null;
    }
  }

  const { error } = await supabase.from("sales").upsert(
    {
      eduzz_invoice_id: invoiceId,
      sale_date: saleDate,
      amount,
      product,
      status: "paga",
      seller_id: sellerId,
      lead_id: leadId,
      utm,
      buyer_email: buyerEmail,
      buyer_document: buyerDocument,
      buyer_name: buyerName,
    },
    { onConflict: "eduzz_invoice_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, action: "paid" });
}
