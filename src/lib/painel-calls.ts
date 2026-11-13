// Painel Calls (/calls): as calls do Téo com a régua do banco (função
// painel_calls, migração 0084) e as contas da página. Datas no fuso de São
// Paulo (o servidor roda em UTC).
//
// Régua (resumo; o detalhe está na migração):
//  * aconteceu: gravação no Teams com fala do lead, nota #call do vendedor,
//    marcação no painel ou venda ligada à call (confirma na hora, sem esperar
//    a gravação; migração 0087);
//  * falta: nada disso depois de apurada (24h), nota #faltou ou marcação;
//  * venda da call: paga em até 48h depois do início, ligada por e-mail,
//    telefone ou nome.

export type Situacao = "aconteceu" | "falta" | "apuracao" | "sem_dado" | "futura" | "cancelada";
export type Fonte = "teams" | "nota" | "painel" | "venda" | null;

export interface CallPainel {
  id: string;
  contactId: string | null;
  nome: string | null;
  email: string | null;
  vendedor: string | null;
  inicio: string;
  criadoEm: string | null;
  situacao: Situacao;
  fonte: Fonte;
  presencaNota: string | null;
  presencaPor: string | null;
  duracaoMin: number | null;
  vendaValor: number | null;
  vendaProduto: string | null;
  vendaEm: string | null;
  vendaPor: string | null;
  /** Eduzz, Asaas ou TMB (vazio enquanto a migração 0085 não está no banco) */
  vendaOrigem: string | null;
  vesperaEm: string | null;
  lembreteEm: string | null;
  esperandoEm: string | null;
}

const numero = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const texto = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export function lerCalls(rows: Record<string, unknown>[] | null | undefined): CallPainel[] {
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    contactId: texto(r.contact_id),
    nome: texto(r.nome),
    email: texto(r.email),
    vendedor: texto(r.vendedor),
    inicio: String(r.inicio),
    criadoEm: texto(r.criado_em),
    situacao: String(r.situacao) as Situacao,
    fonte: (texto(r.fonte) as Fonte) ?? null,
    presencaNota: texto(r.presenca_nota),
    presencaPor: texto(r.presenca_por),
    duracaoMin: numero(r.duracao_min),
    vendaValor: numero(r.venda_valor),
    vendaProduto: texto(r.venda_produto),
    vendaEm: texto(r.venda_em),
    vendaPor: texto(r.venda_por),
    vendaOrigem: texto(r.venda_origem),
    vesperaEm: texto(r.vespera_em),
    lembreteEm: texto(r.lembrete_em),
    esperandoEm: texto(r.esperando_em),
  }));
}

// ---------- datas (São Paulo, sem horário de verão desde 2019: -03:00) ----------

export const TZ = "America/Sao_Paulo";
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtPartes = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "2026-11-12" no fuso de São Paulo. */
export const diaBR = (iso: string | Date): string => fmtDia.format(typeof iso === "string" ? new Date(iso) : iso);

function partes(iso: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const p of fmtPartes.formatToParts(new Date(iso))) o[p.type] = p.value;
  return o;
}

/** Hora cheia (0–23) no fuso de São Paulo. */
export const horaBR = (iso: string): number => Number(partes(iso).hour);

/** "qui 12/11 10:00" */
export function quandoBR(iso: string): string {
  const p = partes(iso);
  return `${(p.weekday ?? "").replace(".", "")} ${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** "qui 12/11" a partir de "2026-11-12". */
export function rotuloDia(dia: string): string {
  const p = partes(`${dia}T12:00:00-03:00`);
  return `${(p.weekday ?? "").replace(".", "")} ${p.day}/${p.month}`;
}

/** Início (inclusive) do dia em São Paulo, em ISO. */
export const inicioDoDia = (dia: string): string => new Date(`${dia}T00:00:00-03:00`).toISOString();

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return diaBR(d);
}

const diasEntre = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);

// ---------- contas ----------

export interface Taxa {
  ok: number;
  base: number;
  taxa: number | null;
}
const taxa = (ok: number, base: number): Taxa => ({ ok, base, taxa: base ? ok / base : null });

// Duração acima disso é sala esquecida aberta, não call.
const DURACAO_MAX_MIN = 120;

export interface Resumo {
  /** sem cancelar e já passou (aconteceu + falta + em apuração + sem dado) */
  marcadas: number;
  aconteceram: number;
  faltas: number;
  apuracao: number;
  semDado: number;
  canceladas: number;
  futuras: number;
  /** aconteceram ÷ (aconteceram + faltas) */
  comparecimento: Taxa;
  /** aconteceram com venda em 48h ÷ aconteceram */
  fechamento: Taxa;
  /** soma das vendas das calls que aconteceram */
  receita: number;
  /** a mesma receita por plataforma (Eduzz, TMB, Asaas); vazio sem a origem */
  receitaPorOrigem: Record<string, number>;
  duracaoMedia: number | null;
  duracaoBase: number;
  /** aconteceram fora da sala do Teams (nota #call ou marcação no painel) */
  foraDoTeams: number;
  faltaramMasCompraram: CallPainel[];
}

export function resumir(calls: CallPainel[]): Resumo {
  const de = (s: Situacao) => calls.filter((c) => c.situacao === s);
  const ok = de("aconteceu");
  const faltas = de("falta");
  const vendidas = ok.filter((c) => c.vendaValor !== null);
  const duracoes = ok.map((c) => c.duracaoMin).filter((d): d is number => d !== null && d > 0 && d <= DURACAO_MAX_MIN);
  return {
    marcadas: calls.filter((c) => ["aconteceu", "falta", "apuracao", "sem_dado"].includes(c.situacao)).length,
    aconteceram: ok.length,
    faltas: faltas.length,
    apuracao: de("apuracao").length,
    semDado: de("sem_dado").length,
    canceladas: de("cancelada").length,
    futuras: de("futura").length,
    comparecimento: taxa(ok.length, ok.length + faltas.length),
    fechamento: taxa(vendidas.length, ok.length),
    receita: vendidas.reduce((s, c) => s + (c.vendaValor ?? 0), 0),
    receitaPorOrigem: vendidas.reduce<Record<string, number>>((acc, c) => {
      if (c.vendaOrigem) acc[c.vendaOrigem] = (acc[c.vendaOrigem] ?? 0) + (c.vendaValor ?? 0);
      return acc;
    }, {}),
    duracaoMedia: duracoes.length ? duracoes.reduce((s, d) => s + d, 0) / duracoes.length : null,
    duracaoBase: duracoes.length,
    foraDoTeams: ok.filter((c) => c.fonte === "nota" || c.fonte === "painel").length,
    faltaramMasCompraram: faltas.filter((c) => c.vendaValor !== null),
  };
}

export interface Comprador {
  nome: string;
  valor: number;
}

export interface Dia {
  dia: string;
  rotulo: string;
  /** aconteceram e viraram venda em até 48h (fica na base da barra) */
  compraram: number;
  /** aconteceram sem venda */
  aconteceram: number;
  faltas: number;
  semResultado: number;
  agendadas: number;
  compradores: Comprador[];
}

export function porDia(calls: CallPainel[], de: string, ate: string): Dia[] {
  const mapa = new Map<string, Dia>();
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    mapa.set(d, { dia: d, rotulo: rotuloDia(d), compraram: 0, aconteceram: 0, faltas: 0, semResultado: 0, agendadas: 0, compradores: [] });
    if (mapa.size > 400) break;
  }
  for (const c of calls) {
    const linha = mapa.get(diaBR(c.inicio));
    if (!linha) continue;
    if (c.situacao === "aconteceu" && c.vendaValor !== null) {
      linha.compraram++;
      linha.compradores.push({ nome: c.nome ?? "—", valor: c.vendaValor });
    } else if (c.situacao === "aconteceu") linha.aconteceram++;
    else if (c.situacao === "falta") linha.faltas++;
    else if (c.situacao === "apuracao" || c.situacao === "sem_dado") linha.semResultado++;
    else if (c.situacao === "futura") linha.agendadas++;
  }
  return [...mapa.values()];
}

export interface LinhaVendedor extends Resumo {
  vendedor: string;
}

export function porVendedor(calls: CallPainel[], nomes: string[]): LinhaVendedor[] {
  const todos = [...new Set([...nomes, ...calls.map((c) => c.vendedor ?? "Sem vendedor")])];
  return todos
    .map((v) => ({ vendedor: v, ...resumir(calls.filter((c) => (c.vendedor ?? "Sem vendedor") === v)) }))
    .filter((l) => l.marcadas + l.canceladas + l.futuras > 0 || nomes.includes(l.vendedor))
    .sort((a, b) => b.marcadas - a.marcadas || a.vendedor.localeCompare(b.vendedor));
}

export interface Faixa {
  rotulo: string;
  aconteceram: number;
  faltas: number;
  comparecimento: Taxa;
}

const apuradas = (calls: CallPainel[]) => calls.filter((c) => c.situacao === "aconteceu" || c.situacao === "falta");

function faixas(calls: CallPainel[], chave: (c: CallPainel) => { ordem: number; rotulo: string } | null): Faixa[] {
  const grupos = new Map<number, { rotulo: string; ok: number; falta: number }>();
  for (const c of apuradas(calls)) {
    const k = chave(c);
    if (!k) continue;
    const g = grupos.get(k.ordem) ?? { rotulo: k.rotulo, ok: 0, falta: 0 };
    if (c.situacao === "aconteceu") g.ok++;
    else g.falta++;
    grupos.set(k.ordem, g);
  }
  return [...grupos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, g]) => ({ rotulo: g.rotulo, aconteceram: g.ok, faltas: g.falta, comparecimento: taxa(g.ok, g.ok + g.falta) }));
}

/** Comparecimento pela antecedência da marcação (dia em que marcou → dia da call). */
export function porAntecedencia(calls: CallPainel[]): Faixa[] {
  return faixas(calls, (c) => {
    if (!c.criadoEm) return null;
    const d = diasEntre(diaBR(c.criadoEm), diaBR(c.inicio));
    if (d <= 0) return { ordem: 0, rotulo: "No mesmo dia" };
    if (d === 1) return { ordem: 1, rotulo: "Para o dia seguinte" };
    if (d <= 3) return { ordem: 2, rotulo: "2 a 3 dias depois" };
    return { ordem: 3, rotulo: "4 dias ou mais" };
  });
}

/** Comparecimento pela hora da call. */
export function porHorario(calls: CallPainel[]): Faixa[] {
  return faixas(calls, (c) => {
    const h = horaBR(c.inicio);
    return { ordem: h, rotulo: `${h}h` };
  });
}

export interface EtapaFunil {
  rotulo: string;
  valor: number;
}

/**
 * Funil do período, por lead (a mesma régua dos KPIs): falaram com o Téo →
 * marcaram call (que já passou) → a call aconteceu → compraram em até 48h
 * depois de uma call que aconteceu. Canceladas e agendadas não entram. Lead com mais de uma call conta
 * uma vez só.
 */
export function funilDoPeriodo(
  calls: CallPainel[],
  /** contatos que falaram com o Téo no período; null esconde a etapa (ex.: filtro por vendedor) */
  conversasDoTeo: string[] | null
): { etapas: EtapaFunil[]; emApuracao: number } {
  const porLead = new Map<string, CallPainel[]>();
  for (const c of calls) {
    if (c.situacao === "cancelada" || c.situacao === "futura") continue;
    const k = c.contactId ?? c.id;
    porLead.set(k, [...(porLead.get(k) ?? []), c]);
  }
  const leads = [...porLead.values()];
  const aconteceu = leads.filter((l) => l.some((c) => c.situacao === "aconteceu"));
  const compraram = aconteceu.filter((l) => l.some((c) => c.situacao === "aconteceu" && c.vendaValor !== null));
  const emApuracao = leads.filter(
    (l) => !l.some((c) => c.situacao === "aconteceu") && l.some((c) => c.situacao === "apuracao")
  ).length;
  // Quem marcou call falou com o Téo, mesmo que a conversa seja de antes do
  // período: a primeira etapa junta os dois pra continuar sendo um funil.
  const falaram = conversasDoTeo ? new Set([...conversasDoTeo, ...porLead.keys()]).size : null;
  return {
    etapas: [
      ...(falaram !== null ? [{ rotulo: "Falaram com o Téo", valor: falaram }] : []),
      { rotulo: "Marcaram call", valor: leads.length },
      { rotulo: "A call aconteceu", valor: aconteceu.length },
      { rotulo: "Compraram em até 48h", valor: compraram.length },
    ],
    emApuracao,
  };
}

export const pct = (t: Taxa | number | null, digitos = 0): string => {
  const v = typeof t === "number" || t === null ? t : t.taxa;
  return v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: digitos })}%`;
};

export const primeiroNome = (nome: string | null): string => (nome ?? "").trim().split(/\s+/)[0] || "—";
