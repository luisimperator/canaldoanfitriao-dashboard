import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Webhook do Asaas — validação de transferências (mecanismo de segurança).
//
// Como funciona (docs.asaas.com › "Mecanismo para validação de saque via
// webhooks"): com o mecanismo ativo, ~5s depois de alguém pedir uma
// transferência o Asaas faz um POST aqui com os dados dela e SÓ executa se
// respondermos {"status":"APPROVED"}. Respondendo {"status":"REFUSED"} (com
// refuseReason opcional) a transferência é cancelada. Se o endpoint falhar
// 3 vezes, o Asaas cancela a transferência — ou seja, o padrão é seguro.
//
// Configuração no Asaas: Menu do usuário > Integrações > Mecanismos de
// segurança > adicionar a URL https://SEU_DOMINIO/api/webhooks/asaas, um
// e-mail para avisos de erro e um token de autenticação (enviado no header
// asaas-access-token — o mesmo valor vai na env ASAAS_WEBHOOK_TOKEN).
//
// Regra de aprovação — a transferência é aprovada se o destino for conhecido:
//   1. chave Pix de destino igual a ASAAS_SWEEP_PIX_KEY (a chave da varredura
//      pro Inter), ou
//   2. CPF/CNPJ de destino presente em ASAAS_TRANSFER_ALLOWED_DOCS (lista
//      separada por vírgula).
// Sem nenhuma das duas envs configuradas, aprova tudo e registra aviso no
// log — configure ao menos uma para travar retiradas a contas desconhecidas.
//
// Toda decisão fica registrada em webhook_log (source='asaas').

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const digits = (s: string) => s.replace(/\D/g, "");

interface AsaasTransferPayload {
  id?: string;
  value?: number;
  status?: string;
  operationType?: string;
  bankAccount?: {
    ownerName?: string | null;
    cpfCnpj?: string | null;
    pixAddressKey?: string | null;
  } | null;
}

export async function POST(req: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return NextResponse.json(
      { error: "ASAAS_WEBHOOK_TOKEN não configurada no servidor." },
      { status: 501 }
    );
  }
  if (req.headers.get("asaas-access-token") !== expectedToken) {
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Notificações de evento comuns (TRANSFER_CREATED, TRANSFER_DONE, ...):
  // só registra e confirma o recebimento — validação é o fluxo abaixo.
  if (typeof body.event === "string") {
    await supabase?.from("webhook_log").insert({
      source: "asaas",
      note: `evento ${body.event}`,
      body,
    });
    return NextResponse.json({ received: true });
  }

  // Fluxo de VALIDAÇÃO: o payload traz a transferência (envelopada em
  // `transfer` ou na raiz, conforme a versão).
  const transfer = ((body.transfer ?? body) as AsaasTransferPayload) || {};
  const valor = typeof transfer.value === "number" ? transfer.value : null;
  const destinoDoc = digits(String(transfer.bankAccount?.cpfCnpj ?? ""));
  const destinoPix = String(transfer.bankAccount?.pixAddressKey ?? "").trim();
  const destinoNome = transfer.bankAccount?.ownerName ?? destinoPix ?? "?";

  const allowlist = (process.env.ASAAS_TRANSFER_ALLOWED_DOCS ?? "")
    .split(",")
    .map((d) => digits(d))
    .filter(Boolean);
  const sweepKey = (process.env.ASAAS_SWEEP_PIX_KEY ?? "").trim();
  // Chaves Pix numéricas (CPF/CNPJ/telefone) comparam só por dígitos;
  // e-mail/EVP comparam em minúsculas.
  const pixIgual =
    sweepKey.length > 0 &&
    destinoPix.length > 0 &&
    (digits(sweepKey).length >= 10
      ? digits(sweepKey) === digits(destinoPix)
      : sweepKey.toLowerCase() === destinoPix.toLowerCase());

  let aprovada: boolean;
  let motivo: string;
  if (allowlist.length === 0 && !sweepKey) {
    aprovada = true;
    motivo =
      "aprovada por padrão — configure ASAAS_SWEEP_PIX_KEY ou ASAAS_TRANSFER_ALLOWED_DOCS para restringir destinos";
  } else if (pixIgual) {
    aprovada = true;
    motivo = `destino é a chave Pix da varredura (${destinoNome})`;
  } else if (destinoDoc && allowlist.includes(destinoDoc)) {
    aprovada = true;
    motivo = `destino ${destinoNome} (${destinoDoc}) está na lista autorizada`;
  } else {
    aprovada = false;
    motivo =
      destinoDoc || destinoPix
        ? `destino ${destinoNome} fora da lista autorizada`
        : "transferência sem destino identificável";
  }

  await supabase?.from("webhook_log").insert({
    source: "asaas",
    note: `transferência ${transfer.id ?? "?"} de R$ ${valor ?? "?"} ${aprovada ? "APROVADA" : "RECUSADA"} — ${motivo}`,
    body,
  });
  console.log(
    `[asaas] validação de transferência ${transfer.id}: ${aprovada ? "APPROVED" : "REFUSED"} (${motivo})`
  );

  if (aprovada) {
    return NextResponse.json({ status: "APPROVED" });
  }
  return NextResponse.json({
    status: "REFUSED",
    refuseReason: "Transferência não reconhecida pelo sistema do Canal do Anfitrião.",
  });
}
