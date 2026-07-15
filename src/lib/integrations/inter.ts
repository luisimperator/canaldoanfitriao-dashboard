// Cliente da API do Banco Inter (conta PJ) com autenticação mTLS.
//
// A API do Inter exige certificado de cliente (mTLS) em TODAS as chamadas,
// inclusive na de token. O `fetch` nativo do Node/Next não permite anexar
// certificado de cliente, então usamos o módulo `node:https` (zero dependência
// extra) com um Agent que carrega o par cert/key. Por isso a rota que usa este
// módulo precisa rodar no runtime Node (`export const runtime = "nodejs"`).
//
// Variáveis de ambiente:
//   INTER_CLIENT_ID      — Client Id da aplicação criada no Internet Banking PJ
//   INTER_CLIENT_SECRET  — Client Secret da mesma aplicação
//   INTER_CERT_PEM       — conteúdo do certificado (.crt) em PEM
//   INTER_KEY_PEM        — conteúdo da chave privada (.key) em PEM
//   INTER_CONTA_CORRENTE — (opcional) número da conta, quando a aplicação
//                          tem acesso a mais de uma conta

import https from "node:https";
import { Buffer } from "node:buffer";

const INTER_HOST = "cdpj.partners.bancointer.com.br";
const SCOPE = "extrato.read";

/** Erro de comunicação com a API do Inter (resposta != 2xx). */
export class InterApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterApiError";
  }
}

export interface InterCreds {
  clientId: string;
  clientSecret: string;
  cert: string;
  key: string;
  contaCorrente?: string;
}

export interface InterTransacao {
  idTransacao?: string;
  dataInclusao?: string;
  dataTransacao: string;
  tipoTransacao?: string;
  tipoOperacao: "C" | "D"; // Crédito (entrada) ou Débito (saída)
  valor: string;
  titulo?: string;
  descricao?: string;
}

// Em variáveis de ambiente (ex.: Vercel) é comum o PEM vir com as quebras de
// linha escapadas como "\n". Normalizamos para o PEM voltar a ter quebras reais.
function normalizePem(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

/** Lê as credenciais do ambiente; retorna null se algo essencial faltar. */
export function getInterCreds(): InterCreds | null {
  const clientId = process.env.INTER_CLIENT_ID;
  const clientSecret = process.env.INTER_CLIENT_SECRET;
  const cert = process.env.INTER_CERT_PEM;
  const key = process.env.INTER_KEY_PEM;
  if (!clientId || !clientSecret || !cert || !key) return null;
  return {
    clientId,
    clientSecret,
    cert: normalizePem(cert),
    key: normalizePem(key),
    contaCorrente: process.env.INTER_CONTA_CORRENTE || undefined,
  };
}

function request(
  creds: InterCreds,
  opts: {
    method: "GET" | "POST";
    path: string;
    headers?: Record<string, string>;
    body?: string;
  }
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: INTER_HOST,
        port: 443,
        method: opts.method,
        path: opts.path,
        cert: creds.cert,
        key: creds.key,
        headers: opts.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function getToken(creds: InterCreds, scope: string = SCOPE): Promise<string> {
  const form = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "client_credentials",
    scope,
  }).toString();

  const res = await request(creds, {
    method: "POST",
    path: "/oauth/v2/token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(form)),
    },
    body: form,
  });

  if (res.status !== 200) {
    throw new InterApiError(`Falha ao obter token (${res.status}): ${res.body}`);
  }
  const json = JSON.parse(res.body) as { access_token?: string };
  if (!json.access_token) {
    throw new InterApiError("Token não retornado pela API do Inter.");
  }
  return json.access_token;
}

interface ExtratoCompletoResponse {
  totalPaginas?: number;
  transacoes?: InterTransacao[];
}

/**
 * Busca os lançamentos do extrato no intervalo informado (datas YYYY-MM-DD),
 * percorrendo todas as páginas. A API do Inter aceita no máximo 90 dias por
 * consulta.
 */
export async function fetchInterTransacoes(
  creds: InterCreds,
  dataInicio: string,
  dataFim: string
): Promise<InterTransacao[]> {
  const token = await getToken(creds);
  const all: InterTransacao[] = [];
  let pagina = 0;
  let totalPaginas = 1;

  do {
    const qs = new URLSearchParams({
      dataInicio,
      dataFim,
      pagina: String(pagina),
      tamanhoPagina: "100",
    }).toString();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (creds.contaCorrente) headers["x-conta-corrente"] = creds.contaCorrente;

    const res = await request(creds, {
      method: "GET",
      path: `/banking/v2/extrato/completo?${qs}`,
      headers,
    });
    if (res.status !== 200) {
      throw new InterApiError(`Falha ao consultar extrato (${res.status}): ${res.body}`);
    }
    const json = JSON.parse(res.body) as ExtratoCompletoResponse;
    all.push(...(json.transacoes ?? []));
    totalPaginas = json.totalPaginas ?? 1;
    pagina += 1;
  } while (pagina < totalPaginas);

  return all;
}

export interface InterPagamentoAgendado {
  data: string; // data de pagamento agendada (YYYY-MM-DD)
  valor: number;
  descricao: string;
  status: string;
}

// Status que significam "não vai mais sair" — tudo o mais numa janela futura
// é pagamento agendado/pendente de aprovação.
const STATUS_ENCERRADO = /REALIZADO|PAGO|CANCELAD|DEVOLVID|ERRO|REJEITAD|EXPIRAD/i;

/**
 * Consulta boletos/pagamentos agendados no Inter (GET /banking/v2/pagamento,
 * filtrando pela data de pagamento). Exige o escopo `pagamento-boleto.read`
 * habilitado na aplicação do Internet Banking — sem ele o token é negado.
 */
export async function fetchInterPagamentosAgendados(
  creds: InterCreds,
  dataInicio: string,
  dataFim: string
): Promise<InterPagamentoAgendado[]> {
  const token = await getToken(creds, "pagamento-boleto.read");
  const qs = new URLSearchParams({
    dataInicio,
    dataFim,
    filtrarDataPor: "PAGAMENTO",
  }).toString();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (creds.contaCorrente) headers["x-conta-corrente"] = creds.contaCorrente;

  const res = await request(creds, {
    method: "GET",
    path: `/banking/v2/pagamento?${qs}`,
    headers,
  });
  if (res.status !== 200) {
    throw new InterApiError(`Falha ao consultar pagamentos (${res.status}): ${res.body}`);
  }

  // O formato varia entre versões: pode ser um array direto ou um objeto com a
  // lista dentro. Os nomes dos campos também têm variantes — tratamos todas.
  const json = JSON.parse(res.body) as unknown;
  const lista: Record<string, unknown>[] = Array.isArray(json)
    ? (json as Record<string, unknown>[])
    : (((json as Record<string, unknown>)?.pagamentos ??
        (json as Record<string, unknown>)?.transacoes ??
        []) as Record<string, unknown>[]);

  const out: InterPagamentoAgendado[] = [];
  for (const p of lista) {
    const status = String(p.statusPagamento ?? p.status ?? "");
    if (STATUS_ENCERRADO.test(status)) continue;
    const valor = Number(p.valorPagamento ?? p.valorNominal ?? p.valorPagar ?? p.valor);
    const data = String(p.dataPagamento ?? p.dataVencimentoDigitada ?? "").slice(0, 10);
    if (!Number.isFinite(valor) || valor <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
    const descricao =
      String(
        p.nomeBeneficiario ??
          (p.beneficiario as Record<string, unknown> | undefined)?.nome ??
          p.descricao ??
          ""
      ).trim() || "Boleto agendado";
    out.push({ data, valor, descricao, status });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

export interface FinTransactionRow {
  transaction_date: string;
  amount: number;
  direction: "in" | "out";
  description: string;
  external_id: string;
}

/** Converte um lançamento do Inter para uma linha de fin_transactions. */
export function toFinTransaction(t: InterTransacao): FinTransactionRow | null {
  const amount = Math.abs(Number(t.valor));
  if (Number.isNaN(amount)) return null;

  const description =
    [t.titulo, t.descricao].filter(Boolean).join(" — ") || t.tipoTransacao || "Lançamento";

  // idTransacao é o identificador estável para deduplicar. Quando ausente
  // (lançamentos antigos), montamos uma chave composta determinística.
  const id =
    t.idTransacao ?? `${t.dataTransacao}|${t.tipoOperacao}|${t.valor}|${description}`;

  return {
    transaction_date: t.dataTransacao,
    amount,
    direction: t.tipoOperacao === "C" ? "in" : "out",
    description,
    external_id: `inter:${id}`,
  };
}
