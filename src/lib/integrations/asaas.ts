// Cliente mínimo da API do Asaas (REST, chave em header access_token).
//
// Variáveis de ambiente:
//   ASAAS_API_KEY (ou ASAAS_TRANSFER_API_KEY) — chave de API do Asaas
//   ASAAS_API_URL — (opcional) base; default produção https://api.asaas.com/v3
//
// Usado pela Provisão de caixa: saldo disponível + cobranças CONFIRMED
// (pagas, aguardando crédito) e PENDING (a vencer, previsão).

export class AsaasApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsaasApiError";
  }
}

export interface AsaasConfig {
  baseUrl: string;
  apiKey: string;
}

export function getAsaasConfig(): AsaasConfig | null {
  const apiKey = process.env.ASAAS_API_KEY || process.env.ASAAS_TRANSFER_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.ASAAS_API_URL || "https://api.asaas.com/v3").replace(/\/$/, ""),
  };
}

async function asaasGet<T>(cfg: AsaasConfig, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { access_token: cfg.apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text) as { errors?: { description?: string }[] };
      if (j.errors?.[0]?.description) msg = j.errors[0].description;
    } catch {
      /* corpo não-JSON — mantém o HTTP status */
    }
    throw new AsaasApiError(`Asaas ${path.split("?")[0]}: ${msg}`);
  }
  return JSON.parse(text) as T;
}

/** Saldo já liquidado na conta Asaas. */
export async function fetchAsaasBalance(cfg: AsaasConfig): Promise<number> {
  const data = await asaasGet<{ balance?: number }>(cfg, "/finance/balance");
  return typeof data.balance === "number" ? data.balance : 0;
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  netValue: number;
  billingType: string;
  dueDate: string;
  description?: string | null;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  creditDate?: string | null;
  estimatedCreditDate?: string | null;
}

/**
 * Lista cobranças por janela de vencimento, paginando até o fim.
 * A API ignora filtro de status na query em algumas versões, então o filtro
 * é reaplicado aqui (aprendizado herdado da integração da Podfactory).
 */
export async function fetchAsaasPayments(
  cfg: AsaasConfig,
  opts: { status: string[]; dueDateGe: string; dueDateLe: string }
): Promise<AsaasPayment[]> {
  const limit = 100;
  const all: AsaasPayment[] = [];
  let offset = 0;
  for (;;) {
    const qs = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      "dueDate[ge]": opts.dueDateGe,
      "dueDate[le]": opts.dueDateLe,
    });
    for (const s of opts.status) qs.append("status[]", s);
    const page = await asaasGet<{ data?: AsaasPayment[]; hasMore?: boolean }>(
      cfg,
      `/payments?${qs.toString()}`
    );
    const items = page.data ?? [];
    all.push(...items);
    if (!page.hasMore || items.length === 0 || offset >= 10_000) break;
    offset += limit;
  }
  const allowed = new Set(opts.status);
  return all.filter((p) => allowed.has(p.status));
}

// --- Sync pro banco (atribuição de vendedor) ---
//
// A provisão de caixa olha o crédito (D+30 do cartão). Aqui é outra pergunta:
// QUANDO a venda foi feita — e isso é a data em que a fatura foi paga.

export interface AsaasCustomer {
  id: string;
  name?: string | null;
  email?: string | null;
  cpfCnpj?: string | null;
  mobilePhone?: string | null;
}

export interface AsaasPaymentFull extends AsaasPayment {
  customer?: string | null;
  invoiceNumber?: string | null;
}

/** Todos os clientes cadastrados (paginado). */
export async function fetchAsaasCustomers(cfg: AsaasConfig): Promise<AsaasCustomer[]> {
  const limit = 100;
  const all: AsaasCustomer[] = [];
  let offset = 0;
  for (;;) {
    const page = await asaasGet<{ data?: AsaasCustomer[]; hasMore?: boolean }>(
      cfg,
      `/customers?limit=${limit}&offset=${offset}`
    );
    const items = page.data ?? [];
    all.push(...items);
    if (!page.hasMore || items.length === 0) break;
    offset += limit;
    if (offset > 10_000) break; // trava de segurança
  }
  return all;
}

/**
 * Cobranças por data de CRIAÇÃO. Filtrar por paymentDate deixava de fora
 * cobrança confirmada que ainda não liquidou (cartão em D+30) — e é
 * justamente esse o caso do saldo de mentoria pago no cartão.
 */
export async function fetchAsaasPaymentsByCreation(
  cfg: AsaasConfig,
  de: string,
  ate: string
): Promise<AsaasPaymentFull[]> {
  const limit = 100;
  const all: AsaasPaymentFull[] = [];
  let offset = 0;
  for (;;) {
    const qs = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      "dateCreated[ge]": de,
      "dateCreated[le]": ate,
    });
    const page = await asaasGet<{ data?: AsaasPaymentFull[]; hasMore?: boolean }>(
      cfg,
      `/payments?${qs.toString()}`
    );
    const items = page.data ?? [];
    all.push(...items);
    if (!page.hasMore || items.length === 0) break;
    offset += limit;
    if (offset > 10_000) break;
  }
  return all;
}
