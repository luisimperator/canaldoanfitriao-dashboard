import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getInterCreds,
  fetchInterTransacoes,
  toFinTransaction,
  InterApiError,
} from "@/lib/integrations/inter";

// Importa o extrato da conta PJ do Banco Inter para fin_transactions.
//
// Por padrão sincroniza os últimos 30 dias; é possível ajustar o intervalo
// passando ?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD (a API do Inter aceita no
// máximo 90 dias por consulta). Os lançamentos são deduplicados por external_id
// (prefixado com "inter:"), então rodar a rota repetidamente é seguro — chame
// periodicamente (ex.: cron do Vercel) ou pelo botão na tela de Integrações.
//
// A autenticação é mTLS; ver src/lib/integrations/inter.ts para os detalhes e
// as variáveis de ambiente necessárias.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const isValidDate = (v: string | null): v is string =>
  v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  const creds = getInterCreds();
  if (!creds) {
    return NextResponse.json(
      {
        error:
          "Integração com o Banco Inter não configurada. Defina INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CERT_PEM e INTER_KEY_PEM (veja o .env.example). Enquanto isso, use o upload de extrato OFX/CSV na tela Financeiro.",
      },
      { status: 501 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  const params = req.nextUrl.searchParams;
  const queryFim = params.get("dataFim");
  const queryInicio = params.get("dataInicio");
  const dataFim = isValidDate(queryFim) ? queryFim : isoDate(new Date());
  const dataInicio = isValidDate(queryInicio)
    ? queryInicio
    : isoDate(new Date(Date.now() - DEFAULT_WINDOW_DAYS * DAY_MS));

  const spanDays = (Date.parse(dataFim) - Date.parse(dataInicio)) / DAY_MS;
  if (Number.isNaN(spanDays) || spanDays < 0) {
    return NextResponse.json(
      { error: "Intervalo inválido: dataFim deve ser igual ou posterior a dataInicio." },
      { status: 400 }
    );
  }
  if (spanDays > MAX_WINDOW_DAYS) {
    return NextResponse.json(
      { error: `Intervalo máximo de ${MAX_WINDOW_DAYS} dias por consulta na API do Inter.` },
      { status: 400 }
    );
  }

  let transacoes;
  try {
    transacoes = await fetchInterTransacoes(creds, dataInicio, dataFim);
  } catch (e) {
    if (e instanceof InterApiError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: `Erro ao consultar o Inter: ${(e as Error).message}` },
      { status: 500 }
    );
  }

  const rows = transacoes
    .map(toFinTransaction)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, imported: 0 });
  }

  const { error } = await supabase
    .from("fin_transactions")
    .upsert(rows, { onConflict: "external_id", ignoreDuplicates: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, imported: rows.length });
}
