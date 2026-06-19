// Lógica de sincronização do extrato do Banco Inter, compartilhada entre as
// rotas /api/sync/inter (botão manual, protegido por login) e
// /api/import/inter (cron, protegido por chave). Retorna status HTTP + corpo
// JSON para a rota apenas repassar — assim a regra de negócio fica num só lugar.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getInterCreds,
  fetchInterTransacoes,
  toFinTransaction,
  InterApiError,
} from "@/lib/integrations/inter";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;

export interface SyncOutcome {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const isValidDate = (v: string | null | undefined): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function runInterSync(params?: {
  dataInicio?: string | null;
  dataFim?: string | null;
}): Promise<SyncOutcome> {
  const creds = getInterCreds();
  if (!creds) {
    return {
      status: 501,
      body: {
        error:
          "Integração com o Banco Inter não configurada. Defina INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CERT_PEM e INTER_KEY_PEM (veja o .env.example).",
      },
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { status: 501, body: { error: "Supabase não configurado." } };
  }

  const dataFim = isValidDate(params?.dataFim) ? params.dataFim : isoDate(new Date());
  const dataInicio = isValidDate(params?.dataInicio)
    ? params.dataInicio
    : isoDate(new Date(Date.now() - DEFAULT_WINDOW_DAYS * DAY_MS));

  const spanDays = (Date.parse(dataFim) - Date.parse(dataInicio)) / DAY_MS;
  if (Number.isNaN(spanDays) || spanDays < 0) {
    return {
      status: 400,
      body: { error: "Intervalo inválido: dataFim deve ser igual ou posterior a dataInicio." },
    };
  }
  if (spanDays > MAX_WINDOW_DAYS) {
    return {
      status: 400,
      body: { error: `Intervalo máximo de ${MAX_WINDOW_DAYS} dias por consulta na API do Inter.` },
    };
  }

  let transacoes;
  try {
    transacoes = await fetchInterTransacoes(creds, dataInicio, dataFim);
  } catch (e) {
    if (e instanceof InterApiError) {
      return { status: 502, body: { error: e.message } };
    }
    return { status: 500, body: { error: `Erro ao consultar o Inter: ${(e as Error).message}` } };
  }

  const rows = transacoes
    .map(toFinTransaction)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    return { status: 200, body: { ok: true, imported: 0 } };
  }

  const { error } = await supabase
    .from("fin_transactions")
    .upsert(rows, { onConflict: "external_id", ignoreDuplicates: true });
  if (error) {
    return { status: 500, body: { error: error.message } };
  }

  return { status: 200, body: { ok: true, imported: rows.length } };
}
