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
  dataReembolso: string | null; // data do estorno, quando reembolsada
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

    // Data do estorno (quando reembolsada). O nome do campo varia conforme a
    // versão do payload da Eduzz — tentamos os mais prováveis.
    const refund = asObj(data.refund);
    const isRefund = status === "refunded" || status === "reembolsada" || status === "chargeback";
    const dataReembolso = isRefund
      ? (data.refundedAt ??
          data.refunded_at ??
          data.refundDate ??
          refund.date ??
          refund.createdAt ??
          refund.processedAt ??
          data.canceledAt ??
          data.updatedAt ??
          null)
      : null;

    compras.push({
      fonte: "eduzz",
      produto: product.name ? String(product.name) : null,
      oferta: offer.name ? String(offer.name) : null,
      valor: toNum(total.value),
      data: row.paid_at ?? data.paidAt ?? row.created_at ?? null,
      status: status || null,
      metodo: data.paymentMethod ? String(data.paymentMethod) : null,
      assinatura: recorrente,
      dataReembolso: dataReembolso ? String(dataReembolso) : null,
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
      dataReembolso: null,
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

// ----------------------------------------------------------------------------
// Busca por CPF ou nome (além do e-mail). O CPF/nome é resolvido para o e-mail
// cadastrado e aí reaproveitamos o getCustomer360 (perfil completo, inclui TMB).
// ----------------------------------------------------------------------------

function onlyDigits(s: string): string {
  return (s || "").replace(/\D+/g, "");
}

// CPF pode estar gravado em dígitos puros ou formatado — tentamos as duas.
function cpfVariants(raw: string): string[] {
  const d = onlyDigits(raw);
  if (d.length !== 11) return d ? [d] : [];
  return [d, `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`];
}

function emptyLookup(label: string, resumo: string): CustomerLookup {
  return {
    found: false,
    email: label,
    nome: null,
    telefone: null,
    documento: null,
    isCliente: false,
    inadimplente: false,
    assinatura: null,
    compras: [],
    parcelados: [],
    resumo,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveByCpf(admin: any, cpf: string): Promise<{ emails: string[]; nome: string | null }> {
  const variants = cpfVariants(cpf);
  if (variants.length === 0) return { emails: [], nome: null };
  const emails = new Set<string>();
  let nome: string | null = null;

  // 1) tabela normalizada `sales` (colunas limpas; preenchida nas vendas recentes)
  try {
    const orSales = variants.map((v) => `buyer_document.eq.${v}`).join(",");
    const r = await admin
      .from("sales")
      .select("buyer_email,buyer_name,buyer_document")
      .or(orSales)
      .limit(50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (r.data ?? []) as any[]) {
      if (row.buyer_email) emails.add(normEmail(String(row.buyer_email)));
      if (!nome && row.buyer_name) nome = String(row.buyer_name);
    }
  } catch {
    /* tabela/coluna pode não existir — ignora e tenta o raw */
  }

  // 2) eduzz_sales_raw — CPF mora dentro do JSON `data`; tentamos os caminhos
  // mais prováveis do payload da Eduzz. Se nenhum casar, degrada sem quebrar.
  try {
    const paths = ["data->buyer->>document", "data->student->>document", "data->>document"];
    const conds: string[] = [];
    for (const p of paths) for (const v of variants) conds.push(`${p}.eq.${v}`);
    const r = await admin.from("eduzz_sales_raw").select("email,data").or(conds.join(",")).limit(50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (r.data ?? []) as any[]) {
      const buyer = asObj(asObj(row.data).buyer);
      const student = asObj(asObj(row.data).student);
      const e = row.email ?? buyer.email ?? student.email;
      if (e) emails.add(normEmail(String(e)));
      if (!nome && (buyer.name ?? student.name)) nome = String(buyer.name ?? student.name);
    }
  } catch {
    /* caminho do JSON pode diferir — ignora */
  }

  return { emails: [...emails], nome };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveByName(admin: any, nomeRaw: string): Promise<string[]> {
  const nome = nomeRaw.trim();
  if (nome.length < 3) return [];
  const like = `%${nome}%`;
  const emails = new Set<string>();
  try {
    const r = await admin.from("sales").select("buyer_email").ilike("buyer_name", like).limit(50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (r.data ?? []) as any[]) if (row.buyer_email) emails.add(normEmail(String(row.buyer_email)));
  } catch {
    /* ignora */
  }
  try {
    const r = await admin.from("eduzz_sales_raw").select("email,data").ilike("data->buyer->>name", like).limit(50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (r.data ?? []) as any[]) {
      const e = row.email ?? asObj(asObj(row.data).buyer).email;
      if (e) emails.add(normEmail(String(e)));
    }
  } catch {
    /* ignora */
  }
  try {
    const r = await admin.from("tmb_pedidos_raw").select("email,cliente").ilike("cliente", like).limit(50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (r.data ?? []) as any[]) if (row.email) emails.add(normEmail(String(row.email)));
  } catch {
    /* ignora */
  }
  return [...emails];
}

// Busca flexível: por e-mail, CPF ou nome. Resolve a identidade para um e-mail
// e devolve o perfil 360. Para nome com vários cadastros, pede o CPF/e-mail.
export async function findCustomer(query: {
  email?: string;
  cpf?: string;
  nome?: string;
}): Promise<CustomerLookup | { error: string }> {
  const email = (query.email ?? "").trim();
  if (email && email.includes("@")) return getCustomer360(email);

  const admin = getSupabaseAdmin();
  if (!admin) return { error: "Supabase não configurado no servidor." };

  const cpf = (query.cpf ?? "").trim();
  if (onlyDigits(cpf).length >= 11) {
    const { emails, nome } = await resolveByCpf(admin, cpf);
    if (emails.length >= 1) return getCustomer360(emails[0]);
    return emptyLookup(
      cpf,
      `Não localizei cadastro com o CPF informado${nome ? ` (${nome})` : ""}. Confirme o CPF ou peça o e-mail da compra.`
    );
  }

  const nome = (query.nome ?? "").trim();
  if (nome.length >= 3) {
    const emails = await resolveByName(admin, nome);
    if (emails.length === 1) return getCustomer360(emails[0]);
    if (emails.length > 1)
      return emptyLookup(
        nome,
        "Há mais de um cadastro com esse nome. Para confirmar a identidade, peça o CPF ou o e-mail da compra."
      );
    return emptyLookup(nome, "Não localizei cadastro com esse nome. Peça o CPF ou o e-mail da compra.");
  }

  return { error: "Informe e-mail, CPF ou nome para a busca." };
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
  valido_ate: string | null; // data (YYYY-MM-DD) ou null = sem validade
}
