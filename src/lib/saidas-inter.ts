import {
  fetchInterPagamentosAgendados,
  getInterCreds,
  type InterPagamentoAgendado,
} from "@/lib/integrations/inter";

// Saídas previstas vindas do banco: boletos e pagamentos agendados na conta
// do Inter (janela de 60 dias à frente). Falha de credencial/escopo não
// derruba a página — volta ok:false com o motivo pra exibir no card.

export interface SaidasInter {
  ok: boolean;
  erro?: string;
  saidas: InterPagamentoAgendado[];
}

function addDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function getSaidasInter(hoje: string, dias = 60): Promise<SaidasInter> {
  const creds = getInterCreds();
  if (!creds) {
    return { ok: false, erro: "Credenciais do Inter não configuradas.", saidas: [] };
  }
  try {
    const saidas = await fetchInterPagamentosAgendados(creds, hoje, addDias(hoje, dias));
    return { ok: true, saidas };
  } catch (e) {
    return { ok: false, erro: (e as Error).message, saidas: [] };
  }
}
