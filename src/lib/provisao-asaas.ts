import {
  fetchAsaasBalance,
  fetchAsaasPayments,
  getAsaasConfig,
  type AsaasPayment,
} from "@/lib/integrations/asaas";
import type { ProvisaoDia } from "@/lib/provisao-caixa";

// Asaas na Provisão de caixa, no mesmo shape da Eduzz:
// - saldo: já liquidado na conta (entra no "Disponível agora")
// - pagoPorDia: cobranças CONFIRMED (cliente pagou, crédito futuro) —
//   usa estimatedCreditDate/creditDate do Asaas; sem ele, infere
//   cartão D+30 / resto D+1 a partir de confirmedDate||paymentDate||dueDate
// - vencerPorDia: PENDING assumindo pagamento no vencimento + mesma regra
// Sem ASAAS_API_KEY configurada, volta ok:false e a página segue só com
// Eduzz + Inter.

export interface ProvisaoAsaas {
  ok: boolean;
  erro?: string;
  saldo: number;
  pagoPorDia: ProvisaoDia[];
  vencerPorDia: ProvisaoDia[];
}

const BILLING_LABEL: Record<string, string> = {
  CREDIT_CARD: "Cartão",
  BOLETO: "Boleto",
  PIX: "Pix",
  UNDEFINED: "Pix/Boleto",
};

function addDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function creditoEstimado(base: string, billingType: string): string {
  return addDias(base.slice(0, 10), billingType === "CREDIT_CARD" ? 30 : 1);
}

function agrupaPorDia(
  pagamentos: { dia: string; p: AsaasPayment }[]
): ProvisaoDia[] {
  const porDia = new Map<string, ProvisaoDia>();
  for (const { dia, p } of pagamentos) {
    const bucket = porDia.get(dia) ?? { dia, valor: 0, cobrancas: 0, items: [] };
    const net = p.netValue || p.value || 0;
    bucket.valor += net;
    bucket.cobrancas += 1;
    bucket.items.push({
      nome: p.description?.trim() || "Cobrança Asaas",
      produto: "Asaas",
      metodo: BILLING_LABEL[p.billingType] ?? p.billingType,
      valor: Math.round(net),
    });
    porDia.set(dia, bucket);
  }
  return [...porDia.values()]
    .map((b) => ({ ...b, valor: Math.round(b.valor), items: b.items.sort((a, c) => c.valor - a.valor) }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

export async function getProvisaoAsaas(hoje: string): Promise<ProvisaoAsaas> {
  const cfg = getAsaasConfig();
  if (!cfg) {
    return { ok: false, erro: "ASAAS_API_KEY não configurada.", saldo: 0, pagoPorDia: [], vencerPorDia: [] };
  }
  try {
    const [saldo, confirmed, pending] = await Promise.all([
      fetchAsaasBalance(cfg),
      fetchAsaasPayments(cfg, {
        status: ["CONFIRMED"],
        dueDateGe: addDias(hoje, -100),
        dueDateLe: addDias(hoje, 60),
      }),
      fetchAsaasPayments(cfg, {
        status: ["PENDING"],
        dueDateGe: hoje,
        dueDateLe: addDias(hoje, 60),
      }),
    ]);

    const pagos = confirmed
      .map((p) => {
        const explicito = p.estimatedCreditDate || p.creditDate;
        const dia = explicito
          ? explicito.slice(0, 10)
          : creditoEstimado(p.confirmedDate || p.paymentDate || p.dueDate, p.billingType);
        return { dia, p };
      })
      .filter(({ dia }) => dia > hoje);

    const aVencer = pending.map((p) => ({ dia: creditoEstimado(p.dueDate, p.billingType), p }));

    return {
      ok: true,
      saldo,
      pagoPorDia: agrupaPorDia(pagos),
      vencerPorDia: agrupaPorDia(aVencer),
    };
  } catch (e) {
    return { ok: false, erro: (e as Error).message, saldo: 0, pagoPorDia: [], vencerPorDia: [] };
  }
}

/** Funde duas listas de dias (soma valores/cobranças e concatena itens). */
export function fundeDias(a: ProvisaoDia[], b: ProvisaoDia[]): ProvisaoDia[] {
  const porDia = new Map<string, ProvisaoDia>();
  for (const d of [...a, ...b]) {
    const atual = porDia.get(d.dia);
    if (!atual) {
      porDia.set(d.dia, { ...d, items: [...d.items] });
    } else {
      atual.valor += d.valor;
      atual.cobrancas += d.cobrancas;
      atual.items = [...atual.items, ...d.items].sort((x, y) => y.valor - x.valor);
    }
  }
  return [...porDia.values()].sort((x, y) => x.dia.localeCompare(y.dia));
}
