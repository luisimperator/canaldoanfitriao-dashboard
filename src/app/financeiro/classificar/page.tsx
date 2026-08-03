import { getDashboardData } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DemoBanner, PageHeader } from "@/components/ui";
import {
  ClassificarLancamentos,
  type CatOpt,
  type RegraRow,
  type TxRow,
} from "@/components/ClassificarLancamentos";

export const dynamic = "force-dynamic";

// Classificação do extrato: onde o humano corrige o que as regras não sabem.
// É daqui que saem os números da Visão geral financeira — margem certa começa
// com lançamento na categoria certa (e distribuição fora do resultado).

export default async function ClassificarPage() {
  const data = await getDashboardData();

  // Regras vivem atrás de RLS sem policy de leitura — só o service role vê.
  const admin = getSupabaseAdmin();
  let regras: RegraRow[] = [];
  if (admin) {
    const { data: r } = await admin
      .from("fin_rules")
      .select("id, prioridade, padrao, direction, category_id")
      .order("prioridade")
      .order("criada_em");
    const nome = new Map(data.finCategories.map((c) => [c.id, c.name]));
    regras = (r ?? []).map((x) => ({
      id: x.id,
      prioridade: Number(x.prioridade),
      padrao: x.padrao,
      direction: x.direction,
      categoria: nome.get(x.category_id) ?? "?",
    }));
  }

  const categorias: CatOpt[] = data.finCategories
    .map((c) => ({ id: c.id, name: c.name, groupName: c.groupName }))
    .sort((a, b) => a.groupName.localeCompare(b.groupName) || a.name.localeCompare(b.name));

  const txs: TxRow[] = [...data.finTransactions]
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
    .map((t) => ({
      id: t.id,
      data: t.transactionDate.slice(0, 10),
      valor: t.amount,
      direction: t.direction,
      descricao: t.description,
      categoriaId: t.categoryId,
      manual: t.categorySource === "manual",
    }));

  return (
    <div>
      <PageHeader
        title="Classificação"
        subtitle="Cada lançamento do extrato ganha um papel contábil — é daqui que saem margem e resultado da Visão geral. Corrija na mão (fica imune às regras) ou crie uma regra pra valer no histórico e nos próximos."
      />
      <DemoBanner show={data.isDemo} />
      <ClassificarLancamentos txs={txs} categorias={categorias} regras={regras} />
    </div>
  );
}
