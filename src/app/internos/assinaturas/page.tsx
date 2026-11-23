import { brl, num } from "@/lib/format";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import {
  acessoAssinaturas,
  carregarAssinaturas,
  carregarOcorrencias,
  inativa,
  TIPO_OCORRENCIA,
  type LinhaAssinatura,
} from "@/lib/assinaturas-painel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assinaturas", robots: { index: false, follow: false } };

// Aba Assinaturas (pedido do Gusta, 23/11): ativas e inativas da Eduzz, quem
// nunca reativou, LTV por aluno e por produto e o registro manual de
// ocorrências (troca de número, pessoa adicional, observação). Fica atrás do
// login do painel (src/proxy.ts), diferente das outras /internos/, porque tem
// dado de aluno.

const ORDEM_LINHAS = ["A5E", "Gigantes", "Max", "Black Friday"];
const LIMITE = 300;

function dataBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function hojeSp(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

const SITUACAO_LABEL: Record<string, string> = {
  ativa: "Ativa",
  atrasada: "Atrasada",
  cancelada: "Cancelada",
  reembolsada: "Reembolsada",
  expirada: "Expirada",
};

function Situacao({ s }: { s: LinhaAssinatura["situacao"] }) {
  const cls =
    s === "ativa"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : s === "atrasada"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{SITUACAO_LABEL[s ?? ""] ?? "—"}</span>;
}

const th = "px-2 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-ink-2 whitespace-nowrap";
const td = "px-2 py-1.5 text-[13px] text-ink align-top";
const tdNum = `${td} text-right tabular-nums whitespace-nowrap`;
const campo =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-2/60 focus:outline-none focus:ring-2 focus:ring-sky-500/40";

export default async function AssinaturasPage({
  searchParams,
}: {
  searchParams: Promise<{ produto?: string; situacao?: string; q?: string; ok?: string; erro?: string }>;
}) {
  const sp = await searchParams;
  const acesso = await acessoAssinaturas();
  if (!acesso.ok) {
    return (
      <div>
        <PageHeader title="Assinaturas" subtitle="Base Eduzz do Canal do Anfitrião" />
        <Card>
          <p className="text-sm text-ink-2">Sem acesso a esta aba. Peça pra um administrador liberar em Usuários.</p>
        </Card>
      </div>
    );
  }
  const [linhas, ocorrencias] = await Promise.all([carregarAssinaturas(), carregarOcorrencias()]);

  if (!linhas) {
    return (
      <div>
        <PageHeader title="Assinaturas" subtitle="Base Eduzz do Canal do Anfitrião" />
        <Card>
          <p className="text-sm text-ink-2">Não consegui ler a base de assinaturas agora. Tente de novo em instantes.</p>
        </Card>
      </div>
    );
  }

  const produtosDisponiveis = Array.from(new Set(linhas.map((l) => l.linha))).sort((a, b) => {
    const ia = ORDEM_LINHAS.indexOf(a);
    const ib = ORDEM_LINHAS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "pt-BR");
  });
  const produto = sp.produto && produtosDisponiveis.includes(sp.produto) ? sp.produto : "todos";
  const situacao = ["ativa", "atrasada", "inativa"].includes(sp.situacao ?? "") ? (sp.situacao as string) : "todas";
  const q = (sp.q ?? "").trim().toLowerCase();
  const qDig = q.replace(/\D/g, "");

  const doProduto = produto === "todos" ? linhas : linhas.filter((l) => l.linha === produto);
  const casaBusca = (l: { nome?: string | null; email?: string | null; telefone?: string | null }) =>
    !q ||
    (l.nome ?? "").toLowerCase().includes(q) ||
    (l.email ?? "").includes(q) ||
    (qDig.length >= 4 && (l.telefone ?? "").includes(qDig));

  // ── Números por produto ──
  const resumo = produtosDisponiveis.map((linha) => {
    const ls = linhas.filter((l) => l.linha === linha);
    // Aluno = e-mail que já pagou algo no produto (quem nunca pagou não entra na média).
    const pagoPorEmail = new Map<string, { pago: number; ltv: number }>();
    let pago = 0;
    for (const l of ls) {
      pago += l.pago;
      if (!l.email) continue;
      const e = pagoPorEmail.get(l.email) ?? { pago: 0, ltv: l.ltv_aluno };
      e.pago += l.pago;
      pagoPorEmail.set(l.email, e);
    }
    const pagantes = Array.from(pagoPorEmail.values()).filter((e) => e.pago > 0);
    const alunos = pagantes.length;
    const ltvTotal = pagantes.reduce((a, e) => a + e.ltv, 0);
    return {
      linha,
      ativas: ls.filter((l) => l.situacao === "ativa").length,
      atrasadas: ls.filter((l) => l.situacao === "atrasada").length,
      inativas: ls.filter((l) => inativa(l.situacao)).length,
      alunos,
      pago,
      ltvProduto: alunos ? pago / alunos : 0,
      ltvAluno: alunos ? ltvTotal / alunos : 0,
    };
  });

  // ── Nunca reativou: saiu e não tem nada ativo/atrasado na mesma linha ──
  const saidas = new Map<
    string,
    { nome: string | null; email: string; telefone: string | null; linha: string; produto: string | null; saida: string | null; acesso: string | null; motivo: string | null; pago: number; ltv: number }
  >();
  for (const l of doProduto) {
    if (!inativa(l.situacao) || l.voltou || !l.email) continue;
    const k = `${l.email}|${l.linha}`;
    const atual = saidas.get(k);
    if (!atual) {
      saidas.set(k, { nome: l.nome, email: l.email, telefone: l.telefone, linha: l.linha, produto: l.produto, saida: l.saida, acesso: l.acesso_ate, motivo: l.motivo_saida, pago: l.pago, ltv: l.ltv_aluno });
    } else {
      atual.pago += l.pago;
      if ((l.saida ?? "") > (atual.saida ?? "")) {
        atual.saida = l.saida;
        atual.acesso = l.acesso_ate;
        atual.motivo = l.motivo_saida;
        atual.produto = l.produto;
      }
    }
  }
  // Quem nunca pagou nada (cancelou antes da 1ª fatura) não conta como ex-aluno.
  const nuncaVoltou = Array.from(saidas.values()).filter((r) => r.pago > 0).sort((a, b) => (b.saida ?? "").localeCompare(a.saida ?? ""));
  const voltaram = new Set(doProduto.filter((l) => inativa(l.situacao) && l.voltou && l.email && l.pago > 0).map((l) => `${l.email}|${l.linha}`)).size;

  // ── KPIs do filtro de produto ──
  const kAtivas = doProduto.filter((l) => l.situacao === "ativa").length;
  const kAtrasadas = doProduto.filter((l) => l.situacao === "atrasada").length;
  const kInativas = doProduto.filter((l) => inativa(l.situacao)).length;
  const pagoEmailProd = new Map<string, number>();
  let pagoProd = 0;
  for (const l of doProduto) {
    pagoProd += l.pago;
    if (l.email) pagoEmailProd.set(l.email, (pagoEmailProd.get(l.email) ?? 0) + l.pago);
  }
  const alunosPagantes = Array.from(pagoEmailProd.values()).filter((v) => v > 0).length;
  const ltvMedio = alunosPagantes ? pagoProd / alunosPagantes : 0;

  // ── Lista filtrada ──
  const filtradas = doProduto
    .filter((l) => (situacao === "todas" ? true : situacao === "inativa" ? inativa(l.situacao) : l.situacao === situacao))
    .filter(casaBusca);
  const ocorrPorEmail = new Map<string, number>();
  for (const o of ocorrencias) if (o.email) ocorrPorEmail.set(o.email.toLowerCase(), (ocorrPorEmail.get(o.email.toLowerCase()) ?? 0) + 1);
  const ocorrFiltradas = ocorrencias.filter(
    (o) =>
      !q ||
      (o.nome ?? "").toLowerCase().includes(q) ||
      (o.email ?? "").toLowerCase().includes(q) ||
      (qDig.length >= 4 && ((o.numero_antigo ?? "").includes(qDig) || (o.numero_novo ?? "").includes(qDig))),
  );
  const nuncaVoltouFiltrado = nuncaVoltou.filter(casaBusca);

  const atualizado = linhas.length ? "a cópia da Eduzz é atualizada a cada 10 min" : "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Interno · dado de aluno, não compartilhar"
        title="Assinaturas"
        subtitle={`Assinaturas e vendas da Eduzz do Canal do Anfitrião (${num(linhas.length)} registros; ${atualizado}). LTV = soma do que o aluno já pagou (faturas pagas na Eduzz, sem reembolsadas).`}
      />

      {(sp.ok || sp.erro) && (
        <div
          className={`rounded-xl border px-4 py-2 text-sm ${sp.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"}`}
        >
          {sp.ok ? "Ocorrência registrada." : `Não registrei: ${sp.erro}`}
        </div>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink-2">
          Produto
          <select name="produto" defaultValue={produto} className={`${campo} mt-1 min-w-40`}>
            <option value="todos">Todos</option>
            {produtosDisponiveis.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-2">
          Status
          <select name="situacao" defaultValue={situacao} className={`${campo} mt-1 min-w-32`}>
            <option value="todas">Todos</option>
            <option value="ativa">Ativas</option>
            <option value="atrasada">Atrasadas</option>
            <option value="inativa">Inativas</option>
          </select>
        </label>
        <label className="text-xs text-ink-2">
          Buscar (nome, e-mail ou telefone)
          <input name="q" defaultValue={sp.q ?? ""} className={`${campo} mt-1 min-w-64`} />
        </label>
        <button type="submit" className="rounded-lg bg-ink px-4 py-1.5 text-sm font-medium text-surface">
          Filtrar
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiCard label="Ativas" value={num(kAtivas)} tone="good" hint={produto === "todos" ? "todos os produtos" : produto} />
        <KpiCard label="Atrasadas" value={num(kAtrasadas)} tone="warn" hint="cobrança em aberto" />
        <KpiCard label="Inativas" value={num(kInativas)} tone="bad" hint="canceladas, suspensas ou reembolsadas" />
        <KpiCard label="Nunca reativaram" value={num(nuncaVoltou.length)} hint={`alunos que saíram; ${num(voltaram)} voltaram`} />
        <KpiCard label="LTV médio" value={brl(ltvMedio)} hint={`no produto, por aluno pagante (${num(alunosPagantes)} alunos)`} />
      </div>

      <Card title="Por produto">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Produto</th>
                <th className={`${th} text-right`}>Ativas</th>
                <th className={`${th} text-right`}>Atrasadas</th>
                <th className={`${th} text-right`}>Inativas</th>
                <th className={`${th} text-right`}>Alunos</th>
                <th className={`${th} text-right`}>Total pago</th>
                <th className={`${th} text-right`}>LTV médio no produto</th>
                <th className={`${th} text-right`}>LTV médio do aluno (tudo)</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((r) => (
                <tr key={r.linha} className="border-b border-line/60">
                  <td className={td}>{r.linha}</td>
                  <td className={tdNum}>{num(r.ativas)}</td>
                  <td className={tdNum}>{num(r.atrasadas)}</td>
                  <td className={tdNum}>{num(r.inativas)}</td>
                  <td className={tdNum}>{num(r.alunos)}</td>
                  <td className={tdNum}>{brl(r.pago)}</td>
                  <td className={tdNum}>{brl(r.ltvProduto)}</td>
                  <td className={tdNum}>{brl(r.ltvAluno)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-2">
          A5E junta o curso (1702138 e 1783828), a renovação do grupo e as cadeiras adicionais; Gigantes junta a pessoa adicional.
          Contagem por assinatura (um aluno pode ter mais de uma). Alunos = e-mails que já pagaram algo no produto. LTV no produto = total pago no produto ÷ alunos; LTV do aluno = tudo o que
          ele pagou na Eduzz, em qualquer produto.
        </p>
      </Card>

      <Card title={`Nunca reativaram (${num(nuncaVoltouFiltrado.length)})`}>
        <p className="mb-3 text-xs text-ink-2">
          Aluno que pagou, teve a assinatura cancelada, suspensa ou reembolsada e (pelo mesmo e-mail) não tem nada ativo ou atrasado no mesmo produto hoje. A Black
          Friday ativa conta como volta pro A5E e pro Gigantes. Saída = quando cancelou ou foi suspensa na Eduzz; “acesso até” = quando a Eduzz tira o acesso (no futuro = pagou até lá).
        </p>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[900px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line">
                <th className={th}>Aluno</th>
                <th className={th}>Telefone</th>
                <th className={th}>Produto</th>
                <th className={th}>Saída</th>
                <th className={th}>Acesso até</th>
                <th className={th}>Motivo</th>
                <th className={`${th} text-right`}>Pago no produto</th>
                <th className={`${th} text-right`}>LTV do aluno</th>
              </tr>
            </thead>
            <tbody>
              {nuncaVoltouFiltrado.slice(0, LIMITE).map((r) => (
                <tr key={`${r.email}|${r.linha}`} className="border-b border-line/60">
                  <td className={td}>
                    <div>{r.nome ?? "—"}</div>
                    <div className="text-xs text-ink-2">{r.email}</div>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{r.telefone ?? "—"}</td>
                  <td className={td}>{r.linha}</td>
                  <td className={`${td} whitespace-nowrap`}>{dataBr(r.saida)}</td>
                  <td className={`${td} whitespace-nowrap`}>{dataBr(r.acesso)}</td>
                  <td className={`${td} text-xs text-ink-2`}>{r.motivo ?? "—"}</td>
                  <td className={tdNum}>{brl(r.pago)}</td>
                  <td className={tdNum}>{brl(r.ltv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nuncaVoltouFiltrado.length > LIMITE && (
          <p className="mt-2 text-xs text-ink-2">Mostrando as {LIMITE} saídas mais recentes; use a busca ou o filtro de produto pra achar as outras.</p>
        )}
      </Card>

      <Card title={`Assinaturas (${num(filtradas.length)})`}>
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line">
                <th className={th}>Aluno</th>
                <th className={th}>Telefone</th>
                <th className={th}>Produto</th>
                <th className={th}>Status</th>
                <th className={th}>Início</th>
                <th className={th}>Vencimento / saída</th>
                <th className={`${th} text-right`}>Faturas pagas</th>
                <th className={`${th} text-right`}>Pago nesta</th>
                <th className={`${th} text-right`}>LTV do aluno</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, LIMITE).map((l) => {
                const n = l.email ? (ocorrPorEmail.get(l.email) ?? 0) : 0;
                return (
                  <tr key={l.id} className="border-b border-line/60">
                    <td className={td}>
                      <div>
                        {l.nome ?? "—"}
                        {n > 0 && (
                          <a href={`?q=${encodeURIComponent(l.email ?? "")}#ocorrencias`} className="ml-2 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
                            {n} ocorr.
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-ink-2">{l.email ?? "—"}</div>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{l.telefone ?? "—"}</td>
                    <td className={td}>
                      <div>{l.linha}</div>
                      <div className="text-xs text-ink-2">
                        {l.produto} ({l.produto_id})
                      </div>
                    </td>
                    <td className={td}>
                      <Situacao s={l.situacao} />
                      {l.voltou && <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">voltou</div>}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{dataBr(l.inicio)}</td>
                    <td className={`${td} whitespace-nowrap`}>{inativa(l.situacao) ? dataBr(l.saida) : dataBr(l.vencimento)}</td>
                    <td className={tdNum}>{num(l.faturas_pagas)}</td>
                    <td className={tdNum}>{brl(l.pago)}</td>
                    <td className={tdNum}>{brl(l.ltv_aluno)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtradas.length > LIMITE && (
          <p className="mt-2 text-xs text-ink-2">Mostrando {LIMITE} de {num(filtradas.length)} (mais recentes primeiro); use a busca ou os filtros.</p>
        )}
      </Card>

      <section id="ocorrencias" className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card title="Registrar ocorrência">
          <form method="post" action="/api/assinaturas/ocorrencias" className="space-y-3">
            <label className="block text-xs text-ink-2">
              Tipo
              <select name="tipo" required defaultValue="troca_numero" className={`${campo} mt-1`}>
                {Object.entries(TIPO_OCORRENCIA).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-ink-2">
              Nome do aluno
              <input name="nome" required className={`${campo} mt-1`} />
            </label>
            <label className="block text-xs text-ink-2">
              E-mail da compra (Eduzz)
              <input name="email" type="email" className={`${campo} mt-1`} />
            </label>
            <label className="block text-xs text-ink-2">
              Produto / compra
              <input name="produto" placeholder="ex.: A5E Eduzz 12/02/2026" className={`${campo} mt-1`} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-ink-2">
                Número antigo
                <input name="numero_antigo" placeholder="+55..." className={`${campo} mt-1`} />
              </label>
              <label className="block text-xs text-ink-2">
                Número novo / da pessoa
                <input name="numero_novo" placeholder="+55..." className={`${campo} mt-1`} />
              </label>
            </div>
            <label className="block text-xs text-ink-2">
              Pessoa adicional (nome)
              <input name="pessoa_adicional" className={`${campo} mt-1`} />
            </label>
            <label className="block text-xs text-ink-2">
              Observação
              <textarea name="observacao" rows={3} className={`${campo} mt-1`} />
            </label>
            <label className="block text-xs text-ink-2">
              Data
              <input name="data_ocorrencia" type="date" defaultValue={hojeSp()} className={`${campo} mt-1`} />
            </label>
            <button type="submit" className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface">
              Registrar
            </button>
            <p className="text-[11px] text-ink-2">Fica registrado com o seu e-mail de login e a data. Registro não se apaga.</p>
          </form>
        </Card>

        <Card title={`Ocorrências registradas (${num(ocorrFiltradas.length)})`}>
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full min-w-[760px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line">
                  <th className={th}>Data</th>
                  <th className={th}>Aluno</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Detalhe</th>
                  <th className={th}>Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {ocorrFiltradas.map((o) => (
                  <tr key={o.id} className="border-b border-line/60">
                    <td className={`${td} whitespace-nowrap`}>{dataBr(o.data_ocorrencia)}</td>
                    <td className={td}>
                      <div>{o.nome ?? "—"}</div>
                      <div className="text-xs text-ink-2">{o.email ?? ""}</div>
                      {o.produto && <div className="text-xs text-ink-2">{o.produto}</div>}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{TIPO_OCORRENCIA[o.tipo]}</td>
                    <td className={`${td} text-xs`}>
                      {(o.numero_antigo || o.numero_novo) && (
                        <div className="whitespace-nowrap">
                          {o.numero_antigo ?? "—"} → {o.numero_novo ?? "—"}
                        </div>
                      )}
                      {o.pessoa_adicional && <div>Pessoa: {o.pessoa_adicional}</div>}
                      {o.observacao && <div className="text-ink-2">{o.observacao}</div>}
                    </td>
                    <td className={`${td} text-xs text-ink-2`}>
                      <div>{o.registrado_por}</div>
                      <div>
                        {o.origem !== "painel" ? `${o.origem} · ` : ""}
                        {dataBr(o.criado_em)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
