// Escolha da turma dos links da sala (/imersao e /i/<codigo>). Função pura
// (sem banco), pra testar com datas simuladas: scripts/testar-escolha-turma.ts.
//
// - /imersao: SÓ turmas antigas (codigo IS NULL). Turma = a de turma_data mais
//   próxima, ativa, com fim_domingo >= agora. Sem nenhuma, mas com turma antiga
//   já terminada: "encerrada". Nunca escolhe turma que tem codigo.
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
  | { tipo: "encerrada"; turma: T }
  | { tipo: "sem_turma" }
  | { tipo: "nao_encontrada" };

const terminou = (t: TurmaEscolhivel, agora: Date) => new Date(t.fim_domingo).getTime() < agora.getTime();

export function escolherTurmaImersao<T extends TurmaEscolhivel>(turmas: T[], agora: Date): Escolha<T> {
  const antigas = turmas.filter((t) => t.codigo == null);
  const ativa = antigas
    .filter((t) => t.ativa && !terminou(t, agora))
    .sort((a, b) => a.turma_data.localeCompare(b.turma_data))[0];
  if (ativa) return { tipo: "turma", turma: ativa };
  const ultima = antigas
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
