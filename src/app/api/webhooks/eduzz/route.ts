import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { confirmarMatricula } from "@/lib/tmb-entrega";
import { notificarVenda } from "@/lib/push";
import { ehProdutoImersao, processarCompraImersao, reembolsarImersao } from "@/lib/imersao";

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
  const { data: logRow } = await supabase
    .from("webhook_log")
    .insert({ source: "eduzz", note: event || "(sem event)", body })
    .select("id")
    .maybeSingle();
  const logId = (logRow?.id as string | undefined) ?? null;

  // Matrícula na Nutror: se for no pacote da Black e o e-mail tiver pedido da
  // TMB esperando a Entrega Manual, fecha como entregue (src/lib/tmb-entrega).
  if (event === "nutror.enrollment_created") {
    try {
      await confirmarMatricula(supabase, body);
    } catch (e) {
      await supabase
        .from("webhook_log")
        .insert({ source: "tmb_painel", note: "erro ao confirmar matrícula", body: { erro: e instanceof Error ? e.message : String(e) } });
    }
    return NextResponse.json({ ok: true, action: "logged", event });
  }

  const invoiceId = String(data.id ?? data.invoice_id ?? "");

  // Imersão A5E (lançamento pago): reembolso/chargeback marca o comprador como
  // reembolsado e tira as tags do Mailchimp (src/lib/imersao).
  if ((event === "myeduzz.invoice_refunded" || event === "myeduzz.invoice_chargeback") && invoiceId) {
    try {
      if (await reembolsarImersao(supabase, invoiceId)) {
        return NextResponse.json({ ok: true, action: "imersao_reembolso" });
      }
    } catch (e) {
      if (logId) {
        await supabase
          .from("webhook_log")
          .update({ etapa: "imersao reembolso", pendente: true, erro: e instanceof Error ? e.message : String(e) })
          .eq("id", logId);
      }
    }
  }

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

  // --- Imersão A5E (ingresso de R$ 27, lançamento pago semanal) ---
  // Vai pra imersao_compradores (turma do próximo sábado + tags), e NÃO pra
  // `sales`: o ingresso contaria como venda do A5E nas métricas do time
  // (leads por venda, capacidade do vendedor) e marcaria o lead como
  // convertido, tirando-o do funil do produto principal.
  if (ehProdutoImersao(data)) {
    try {
      const r = await processarCompraImersao(supabase, data, logId);
      return NextResponse.json({ ok: true, action: "imersao_paid", ...r });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      if (logId) {
        await supabase.from("webhook_log").update({ etapa: "imersao", pendente: true, erro }).eq("id", logId);
      }
      // 500 faz a Eduzz reenviar; o processamento é idempotente pela fatura.
      return NextResponse.json({ error: erro }, { status: 500 });
    }
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
  // Preço do produto (com cupom, sem os juros do parcelamento): o que a
  // empresa recebe. amount continua com o valor pago, como no histórico.
  const preco = Number(data.price?.value ?? data.items?.[0]?.price?.value ?? 0) || null;

  // UTMs vêm em campos diferentes conforme a versão do payload; guarda o que houver.
  const utm = data.utm ?? data.tracker ?? data.utmParameters ?? null;

  // O vendedor é o do link (utm_source com o nome dele, links individuais dos
  // vendedores); sem vendedor no link, vale o dono do lead no CRM (por e-mail).
  // Fernando, 14/11: o link vale mais que o dono do CRM (a Claudia Reis pagou
  // pelo link do Breno, que fez o follow-up, e a venda tinha ido pro Flávio,
  // dono do lead desde a lista de espera).
  const buyerEmail: string | null = data.buyer?.email ?? data.student?.email ?? null;
  const buyerDocument: string | null = data.buyer?.document ?? data.student?.document ?? null;
  const buyerName: string | null = data.buyer?.name ?? data.student?.name ?? null;
  let sellerId: string | null = null;
  let leadId: string | null = null;
  // Vendedor pelo utm_source: uma palavra do utm que começa com o primeiro nome
  // do vendedor (ex.: "breno", "flavio", "flaviov"); "teo", "facebook" ou
  // "recuperacao_unnichat" não casam com ninguém.
  let vendedorDoLink: string | null = null;
  const utmSource = semAcento(String(utm?.source ?? utm?.utm_source ?? "").toLowerCase());
  if (utmSource) {
    const palavras = utmSource.split(/[^a-z0-9]+/).filter(Boolean);
    const { data: sellers } = await supabase
      .from("sellers")
      .select("id, name")
      .eq("is_active", true);
    const match = (sellers ?? []).find((s) => {
      const nome = semAcento(s.name.split(" ")[0].toLowerCase());
      return palavras.some((p) => p.startsWith(nome)); // "flavio", "flaviov"
    });
    vendedorDoLink = match?.id ?? null;
  }
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
      sellerId = vendedorDoLink ?? lead.seller_id;
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
  if (!sellerId) sellerId = vendedorDoLink;

  const { error } = await supabase.from("sales").upsert(
    {
      eduzz_invoice_id: invoiceId,
      sale_date: saleDate,
      amount,
      preco,
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

  // Aviso de venda nova no celular (uma vez por fatura), depois de responder
  // à Eduzz pra não segurar o webhook.
  after(async () => {
    let vendedor: string | null = null;
    if (sellerId) {
      const { data: s } = await supabase.from("sellers").select("name").eq("id", sellerId).maybeSingle();
      vendedor = s?.name ?? null;
    }
    // No aviso vai o preço do produto (com cupom, sem os juros do
    // parcelamento) e em quantas vezes; a venda continua gravada com o valor
    // pago (amount), como no histórico.
    const parcelas = Number(data.installments ?? 0) || null;
    await notificarVenda({
      chave: `eduzz:${invoiceId}`,
      plataforma: "Eduzz",
      valor: preco ?? amount,
      produto: product,
      vendedor,
      parcelas,
      metodo: typeof data.paymentMethod === "string" ? data.paymentMethod : (data.payment?.method ?? null),
    });
  });
  return NextResponse.json({ ok: true, action: "paid" });
}
