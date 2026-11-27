// Escolha da turma dos links da sala (/imersao e /i/<codigo>). Função pura
// (sem banco), pra testar com datas simuladas: scripts/testar-escolha-turma.ts.
//
// - /imersao: primeiro as turmas antigas (codigo IS NULL): a de turma_data mais
//   próxima, ativa, com fim_domingo >= agora. Sem turma antiga em andamento, vai
//   pra turma COM codigo ativa mais próxima (fim_domingo >= agora): "redireciona"
//   (302 pro /i/<codigo>; quem compra cai no obrigado /imersao, Gusta 27/11).
//   "encerrada" só quando não sobra nenhuma turma ativa no futuro.
// - /i/<codigo>: presa à turma de codigo exato (case-sensitive). Sem turma com
//   esse codigo: "nao_encontrada" (404). Depois do fim_domingo dela (ou se ela
//   foi desativada): "encerrada", nunca outra turma.

export interface TurmaEscolhivel {
  turma_data: string;
  fim_domingo: string;
  ativa: boolean;
  codigo: string | null;
}

export type Escolha<T> =
  | { tipo: "turma"; turma: T }
  | { tipo: "redireciona"; turma: T }
  | { tipo: "encerrada"; turma: T }
  | { tipo: "sem_turma" }
  | { tipo: "nao_encontrada" };

const terminou = (t: TurmaEscolhivel, agora: Date) => new Date(t.fim_domingo).getTime() < agora.getTime();

const maisProxima = <T extends TurmaEscolhivel>(turmas: T[], agora: Date) =>
  turmas
    .filter((t) => t.ativa && !terminou(t, agora))
    .sort((a, b) => a.turma_data.localeCompare(b.turma_data))[0];

export function escolherTurmaImersao<T extends TurmaEscolhivel>(turmas: T[], agora: Date): Escolha<T> {
  const ativa = maisProxima(turmas.filter((t) => t.codigo == null), agora);
  if (ativa) return { tipo: "turma", turma: ativa };
  const comCodigo = maisProxima(turmas.filter((t) => t.codigo != null), agora);
  if (comCodigo) return { tipo: "redireciona", turma: comCodigo };
  const ultima = turmas
    .filter((t) => terminou(t, agora))
    .sort((a, b) => b.turma_data.localeCompare(a.turma_data))[0];
  if (ultima) return { tipo: "encerrada", turma: ultima };
  return { tipo: "sem_turma" };
}

export function escolherTurmaPorCodigo<T extends TurmaEscolhivel>(turmas: T[], codigo: string, agora: Date): Escolha<T> {
  const turma = codigo ? turmas.find((t) => t.codigo === codigo) : undefined;
  if (!turma) return { tipo: "nao_encontrada" };
  if (!turma.ativa || terminou(turma, agora)) return { tipo: "encerrada", turma };
  return { tipo: "turma", turma };
}

// ---------- obrigado da Eduzz (/imersao/obrigado) ----------
//
// Quem acabou de comprar vai pra turma À VENDA agora: a de turma_data mais
// próxima, ativa, cujo corte de vendas (inicio_sabado = sábado 10h SP, mesma
// regra do turmaParaCompra) ainda não chegou. Assim o obrigado muda sozinho
// quando a turma vira, sem trocar URL na Eduzz a cada semana (Gusta, 27/11).
// Turma à venda sem codigo (não tem /i/) ou nenhuma cadastrada: "sem_turma_a_venda"
// (página de compra confirmada + alerta).

export interface TurmaVendivel {
  turma_data: string;
  inicio_sabado: string;
  ativa: boolean;
  codigo: string | null;
}

export type EscolhaObrigado<T> =
  | { tipo: "redireciona"; turma: T }
  | { tipo: "sem_turma_a_venda"; turma: T | null };

export function escolherTurmaAVenda<T extends TurmaVendivel>(turmas: T[], agora: Date): EscolhaObrigado<T> {
  const aVenda = turmas
    .filter((t) => t.ativa && new Date(t.inicio_sabado).getTime() > agora.getTime())
    .sort((a, b) => a.turma_data.localeCompare(b.turma_data))[0];
  if (aVenda && aVenda.codigo) return { tipo: "redireciona", turma: aVenda };
  return { tipo: "sem_turma_a_venda", turma: aVenda ?? null };
}

// ---------- faixa grande da página de espera ----------

const SP = "America/Sao_Paulo";
const diaSPde = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: SP }).format(d);
const diasEntre = (de: string, ate: string) => {
  const utc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(ate) - utc(de)) / 86400000);
};

/**
 * Faixa grande acima do título da espera, antes do sábado. "Começamos às 10:00"
 * só no próprio dia (pedido de 21/11: na turma da semana seguinte a hora
 * aparecia já no sábado anterior). Antes disso: "Começa amanhã", "Começa no
 * próximo sábado" (até 7 dias) ou "Começa sábado, 28/11".
 */
export function destaqueAntes(inicio: Date, agora: Date): string {
  const faltam = diasEntre(diaSPde(agora), diaSPde(inicio));
  if (faltam <= 0) {
    const hhmm = new Intl.DateTimeFormat("pt-BR", { timeZone: SP, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(inicio);
    return `Começamos às ${hhmm}`;
  }
  if (faltam === 1) return "Começa amanhã";
  const semana = new Intl.DateTimeFormat("pt-BR", { timeZone: SP, weekday: "long" }).format(inicio).replace(/-feira$/, "");
  if (faltam <= 7) return `Começa no próximo ${semana}`;
  const ddmm = new Intl.DateTimeFormat("pt-BR", { timeZone: SP, day: "2-digit", month: "2-digit" }).format(inicio);
  return `Começa ${semana}, ${ddmm}`;
}
