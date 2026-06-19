// Suporte ao cliente final (pós-venda).
//
// "Cliente 360": dado um e-mail, junta o que o banco já sabe daquela pessoa
// para o suporte (humano ou IA) responder com fato, não com achismo:
//   - compras na Eduzz (eduzz_sales_raw.data — buyer/product/offer/total/status)
//   - parcelados na TMB (tmb_pedidos_raw — adimplência, parcelas, melhor dia)
//   - telefone/nome via unnichat_contacts (ponte telefone ↔ e-mail)
//
// Tudo é lido com a service role (getSupabaseAdmin); nunca exponha estes dados
// para o cliente final cru — é insumo interno do atendimento.

import { getSupabaseAdmin } from "@/lib/supabase-admin";

// ---- Tipos do retorno normalizado ----

export interface CustomerPurchase {
  fonte: "eduzz" | "tmb";
  produto: string | null;
  oferta: string | null;
  valor: number | null;
  data: string | null; // ISO (mais recente primeiro)
  status: string | null; // paid/refunded... (Eduzz) | Efetivado/Cancelado (TMB)
  metodo: string | null;
  assinatura: boolean; // produto recorrente (renovação anual)?
}

export interface CustomerInstallment {
  pedidoId: number;
  produto: string | null;
  statusPedido: string | null;
  statusFinanceiro: string | null; // Adimplente | Inadimplente | Quitado
  parcelas: number | null;
  valorParcela: number | null;
  valorTotal: number | null;
  melhorDiaPagamento: number | null;
}

export interface CustomerLookup {
  found: boolean;
  email: string;
  nome: string | null;
  telefone: string | null;
  documento: string | null;
  isCliente: boolean; // tem ao menos uma compra paga/efetivada
  inadimplente: boolean; // parcelado em atraso ou recorrência em recuperação
  assinatura: { ativa: boolean; produto: string | null } | null;
  compras: CustomerPurchase[];
  parcelados: CustomerInstallment[];
  resumo: string; // resumo curto em PT para o atendimento
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asObj(v: any): Record<string, any> {
  return v && typeof v === "object" ? v : {};
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Dado um e-mail, monta o perfil 360 do cliente. Devolve {error} se o servidor
// não tem Supabase configurado, ou um CustomerLookup (com found=false quando o
// e-mail não existe em nenhuma base — o atendimento pede a reconfirmação).
export async function getCustomer360(
  emailRaw: string
): Promise<CustomerLookup | { error: string }> {
  const email = normEmail(emailRaw);
  if (!email || !email.includes("@")) {
    return { error: "Informe um e-mail válido." };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { error: "Supabase não configurado no servidor." };
  }

  const [eduzzRes, tmbRes, contactRes] = await Promise.all([
    admin
      .from("eduzz_sales_raw")
      .select("id,status,paid_at,created_at,data")
      .ilike("email", email),
    admin
      .from("tmb_pedidos_raw")
      .select(
        "pedido_id,cliente,email,lancamento,status_pedido,status_financeiro,valor_total,parcelas,valor_parcela,melhor_dia_pagamento,data_efetivado,criado_em"
      )
      .ilike("email", email),
    admin
      .from("unnichat_contacts")
      .select("phone,name,email")
      .ilike("email", email)
      .limit(1),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eduzzRows = (eduzzRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tmbRows = (tmbRes.data ?? []) as any[];
  const contact = (contactRes.data ?? [])[0] as
    | { phone?: string; name?: string; email?: string }
    | undefined;

  // ---- Compras da Eduzz ----
  const compras: CustomerPurchase[] = [];
  let nome: string | null = contact?.name ?? null;
  let telefone: string | null = contact?.phone ?? null;
  let documento: string | null = null;
  let assinaturaProduto: string | null = null;
  let assinaturaAtiva = false;
  let eduzzRecovering = false;

  for (const row of eduzzRows) {
    const data = asObj(row.data);
    const buyer = asObj(data.buyer);
    const product = asObj(data.product);
    const offer = asObj(data.offer);
    const total = asObj(data.total);
    const recorrente = String(product.billingType ?? "") === "recurrence";

    if (!nome && buyer.name) nome = String(buyer.name);
    if (!telefone && buyer.phone) telefone = String(buyer.phone);
    if (!documento && buyer.document) documento = String(buyer.document);

    const status = String(row.status ?? data.status ?? "");
    if (status === "recovering") eduzzRecovering = true;
    if (recorrente) {
      assinaturaProduto = product.name ? String(product.name) : assinaturaProduto;
      // Considera a assinatura ativa se a última recorrência está paga/em
      // recuperação (não cancelada/reembolsada).
      if (status === "paid" || status === "recovering") assinaturaAtiva = true;
    }

    compras.push({
      fonte: "eduzz",
      produto: product.name ? String(product.name) : null,
      oferta: offer.name ? String(offer.name) : null,
      valor: toNum(total.value),
      data: row.paid_at ?? data.paidAt ?? row.created_at ?? null,
      status: status || null,
      metodo: data.paymentMethod ? String(data.paymentMethod) : null,
      assinatura: recorrente,
    });
  }

  // ---- Parcelados da TMB ----
  const parcelados: CustomerInstallment[] = [];
  let inadimplente = eduzzRecovering;
  for (const row of tmbRows) {
    const statusFin = row.status_financeiro ? String(row.status_financeiro) : null;
    if (statusFin === "Inadimplente") inadimplente = true;
    if (!nome && row.cliente) nome = String(row.cliente).trim();

    parcelados.push({
      pedidoId: Number(row.pedido_id),
      produto: row.lancamento ? String(row.lancamento) : null,
      statusPedido: row.status_pedido ? String(row.status_pedido) : null,
      statusFinanceiro: statusFin,
      parcelas: toNum(row.parcelas),
      valorParcela: toNum(row.valor_parcela),
      valorTotal: toNum(row.valor_total),
      melhorDiaPagamento: toNum(row.melhor_dia_pagamento),
    });

    // TMB também é uma compra na linha do tempo.
    compras.push({
      fonte: "tmb",
      produto: row.lancamento ? String(row.lancamento) : null,
      oferta: null,
      valor: toNum(row.valor_total),
      data: row.data_efetivado ?? row.criado_em ?? null,
      status: row.status_pedido ? String(row.status_pedido) : null,
      metodo: "Parcelado (TMB)",
      assinatura: false,
    });
  }

  // Ordena por data (mais recente primeiro).
  compras.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));

  const temEduzzPaga = eduzzRows.some(
    (r) => String(r.status ?? asObj(r.data).status ?? "") === "paid"
  );
  const temTmbEfetivado = tmbRows.some(
    (r) => String(r.status_pedido ?? "") === "Efetivado"
  );
  const isCliente = temEduzzPaga || temTmbEfetivado;
  const found = eduzzRows.length > 0 || tmbRows.length > 0 || Boolean(contact);

  const resumo = buildResumo({
    found,
    isCliente,
    inadimplente,
    nome,
    compras,
    assinatura: assinaturaProduto ? { ativa: assinaturaAtiva, produto: assinaturaProduto } : null,
  });

  return {
    found,
    email,
    nome,
    telefone,
    documento,
    isCliente,
    inadimplente,
    assinatura: assinaturaProduto
      ? { ativa: assinaturaAtiva, produto: assinaturaProduto }
      : null,
    compras,
    parcelados,
    resumo,
  };
}

function buildResumo(c: {
  found: boolean;
  isCliente: boolean;
  inadimplente: boolean;
  nome: string | null;
  compras: CustomerPurchase[];
  assinatura: { ativa: boolean; produto: string | null } | null;
}): string {
  if (!c.found) {
    return "E-mail não localizado em nenhuma base (Eduzz/TMB/Unnichat). Peça a reconfirmação do e-mail cadastrado na compra.";
  }
  const partes: string[] = [];
  partes.push(c.nome ? `${c.nome}.` : "Contato sem nome cadastrado.");
  if (c.isCliente) {
    const pagas = c.compras.filter(
      (p) => p.status === "paid" || p.status === "Efetivado"
    );
    partes.push(
      `Cliente com ${pagas.length} compra(s) confirmada(s)` +
        (pagas[0]?.produto ? ` (mais recente: ${pagas[0].produto}).` : ".")
    );
  } else {
    partes.push("Ainda não é cliente (sem compra confirmada) — encaminhar pro time de vendas.");
  }
  if (c.assinatura) {
    partes.push(
      c.assinatura.ativa
        ? `Assinatura ATIVA${c.assinatura.produto ? ` (${c.assinatura.produto})` : ""}.`
        : `Assinatura inativa/cancelada${c.assinatura.produto ? ` (${c.assinatura.produto})` : ""}.`
    );
  }
  if (c.inadimplente) partes.push("⚠️ INADIMPLENTE — há pagamento em atraso.");
  return partes.join(" ");
}

// ---- Base de conhecimento (treinamento) ----

export const KB_BLOCOS: { key: string; label: string }[] = [
  { key: "ingressos", label: "Ingressos do Encontro" },
  { key: "renovacao", label: "Renovação / cancelamento" },
  { key: "acesso", label: "Acesso, conteúdo, bônus e grupo" },
  { key: "dados", label: "Dados cadastrais / transferência" },
  { key: "pagamento", label: "Validade do acesso e pagamento" },
  { key: "brindes", label: "Brindes não recebidos" },
  { key: "regras_ouro", label: "Regras de ouro" },
  { key: "outro", label: "Outro" },
];

export function blocoLabel(key: string): string {
  return KB_BLOCOS.find((b) => b.key === key)?.label ?? key;
}

export interface KbItem {
  id: string;
  bloco: string;
  titulo: string;
  conteudo: string;
  ativo: boolean;
  ordem: number;
  updated_at: string;
}
