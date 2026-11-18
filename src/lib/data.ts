// Camada de acesso a dados.
// Com NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY definidos,
// lê do Supabase (tabelas em supabase/migrations/0001_schema.sql).
// Sem credenciais, cai no modo demo com dados gerados.

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { generateDemoData } from "./demo-data";
import type {
  AdSpend,
  DashboardData,
  FinCategory,
  FinTransaction,
  Lead,
  LeadUtm,
  Sale,
  Seller,
} from "./types";

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Lê com a SERVICE ROLE, não com a chave anônima.
//
// Este módulo só roda no servidor: quem o importa são server components
// (início, vendas, CRM, funil, CAC, gargalo, origem, encontro, links,
// financeiro/provisão) e `getSupabase` não escapa daqui. O recorte de acesso
// dessas telas é o `proxy.ts` + `getAccess()`, não o RLS.
//
// Por que mudou (22/09/2026): as políticas de leitura de leads, sales,
// sellers, ad_spend, fin_categories, fin_source_files, fin_transactions,
// lista_espera_sync_log e analytics_snapshot passaram de `anon` para
// `authenticated` no endurecimento pós-infostealer de 20/09. A chave anônima
// viaja no bundle do navegador e vazou junto com o resto — com ela em `anon`,
// qualquer um lia 49 mil leads, as vendas e o financeiro sem login.
//
// O cliente daqui era montado com a chave anônima e SEM sessão, então para o
// banco ele era o papel `anon`. Depois da mudança as consultas passaram a
// voltar **vazias, sem erro**, e o dashboard inteiro mostrou zero. Ler com a
// service role corrige sem reabrir a porta: a política continua fechada para
// `anon`, e quem entra continua passando pelo porteiro do app.
//
// Se a service role não estiver configurada, cai na anônima — é o caso do
// desenvolvimento local e do modo demo, onde não há o que proteger.
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole) {
    return createClient(url, serviceRole, { auth: { persistSession: false } });
  }
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

// Dia-calendário de São Paulo de um timestamptz. mql_at vem em UTC; fatiar a
// string jogava os MQLs das 21h–24h (16% deles) no dia seguinte — todo o resto
// do dashboard conta dias no fuso SP (ver metrics.ts).
function spDay(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts).slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

// O Supabase devolve no máximo 1000 linhas por consulta; com 45 mil leads são
// dezenas de páginas. Buscá-las em fila (uma esperando a outra) custava ~15s
// por request — as páginas são independentes, então vão todas de uma vez,
// em lotes, depois de um count() para saber quantas são.
const PAGE = 1000;
const CONCORRENCIA = 8;

async function selectAll(
  supabase: ReturnType<typeof getSupabase>,
  table: string,
  columns: string,
  orderBy = "id"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const { count, error: countError } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (countError) {
    throw new Error(`Erro ao contar o Supabase (${table}): ${countError.message}`);
  }
  const total = count ?? 0;
  if (total === 0) return [];

  const inicios: number[] = [];
  for (let from = 0; from < total; from += PAGE) inicios.push(from);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paginas: any[][] = new Array(inicios.length);
  for (let i = 0; i < inicios.length; i += CONCORRENCIA) {
    const lote = inicios.slice(i, i + CONCORRENCIA);
    await Promise.all(
      lote.map(async (from, j) => {
        const { data, error } = await supabase
          .from(table)
          .select(columns)
          .order(orderBy, { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) {
          throw new Error(`Erro ao consultar o Supabase (${table}): ${error.message}`);
        }
        paginas[i + j] = data ?? [];
      })
    );
  }
  return paginas.flat();
}

// Chave do telefone pra casar o comprador da imersão com o lead: DDD + 8
// últimos dígitos (sem o 55 e sem depender do 9 extra, que às vezes falta).
function chaveFone(fone: unknown): string | null {
  let d = String(fone ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}

function temAlgumaUtm(u: unknown): u is LeadUtm {
  if (!u || typeof u !== "object") return false;
  const o = u as Record<string, unknown>;
  return ["source", "medium", "campaign", "content", "term", "vidorigem"].some((k) => Boolean(o[k]));
}

// Origem de quem comprou a imersão (Fernando, 18/11: "0% dos leads com origem
// rastreada"). O checkout da imersão grava a UTM da compra em
// imersao_compradores, mas o lead nasce pelo Mailchimp ou pelo Unnichat sem
// ela. Lead sem UTM própria herda a da primeira compra da imersão com o mesmo
// e-mail ou o mesmo telefone. Só na leitura: nada é gravado no lead.
async function utmDaImersao(supabase: ReturnType<typeof getSupabase>) {
  const porEmail = new Map<string, LeadUtm>();
  const porFone = new Map<string, LeadUtm>();
  try {
    const linhas = await selectAll(
      supabase,
      "imersao_compradores",
      "email, telefone, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at",
      "created_at"
    );
    for (const r of linhas) {
      const utm: LeadUtm = {
        source: r.utm_source || null,
        medium: r.utm_medium || null,
        campaign: r.utm_campaign || null,
        content: r.utm_content || null,
        term: r.utm_term || null,
      };
      if (!temAlgumaUtm(utm)) continue;
      const email = String(r.email ?? "").trim().toLowerCase();
      if (email && !porEmail.has(email)) porEmail.set(email, utm);
      const fone = chaveFone(r.telefone);
      if (fone && !porFone.has(fone)) porFone.set(fone, utm);
    }
  } catch {
    /* sem a tabela da imersão o painel segue só com a UTM do lead */
  }
  return { porEmail, porFone };
}

async function fetchDashboardFromSupabase(): Promise<DashboardData> {
  const supabase = getSupabase();
  const [sellers, leads, sales, adSpend, finCategories, finTransactions, imersao] =
    await Promise.all([
      selectAll(supabase, "sellers", "id, name, is_active"),
      selectAll(
        supabase,
        "leads",
        "id, created_at, source, status, seller_id, pipeline_stage, name, phone, email, mailchimp_id, unnichat_id, extra, mql_at"
      ),
      selectAll(supabase, "sales", "id, sale_date, amount, seller_id, product, status, utm"),
      selectAll(supabase, "ad_spend", "date, platform, amount", "date"),
      selectAll(supabase, "fin_categories", "id, group_name, name"),
      selectAll(
        supabase,
        "fin_transactions",
        "id, transaction_date, amount, direction, description, counterparty, category_id"
      ),
      utmDaImersao(supabase),
    ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utmDoLead = (r: any): LeadUtm | null => {
    const propria = r.extra && typeof r.extra === "object" ? r.extra.utm : null;
    if (temAlgumaUtm(propria)) return propria;
    const email = String(r.email ?? "").trim().toLowerCase();
    const fone = chaveFone(r.phone);
    return (
      (email ? imersao.porEmail.get(email) : undefined) ??
      (fone ? imersao.porFone.get(fone) : undefined) ??
      propria ??
      null
    );
  };

  return {
    sellers: sellers.map(
      (r): Seller => ({ id: r.id, name: r.name, isActive: r.is_active })
    ),
    leads: leads.map(
      (r): Lead => ({
        id: r.id,
        createdAt: String(r.created_at).slice(0, 10),
        source: r.source,
        status: r.status,
        sellerId: r.seller_id,
        pipelineStage: r.pipeline_stage,
        name: r.name,
        phone: r.phone,
        extra: r.extra,
        utm: utmDoLead(r),
        // undefined (e não false) pra não pesar no cache dos ~50 mil leads
        soWhatsapp: !r.mailchimp_id && r.unnichat_id ? true : undefined,
        mqlAt: r.mql_at ? spDay(String(r.mql_at)) : null,
      })
    ),
    sales: sales.map(
      (r): Sale => ({
        id: r.id,
        saleDate: String(r.sale_date).slice(0, 10),
        amount: Number(r.amount),
        sellerId: r.seller_id,
        product: r.product,
        status: r.status,
        utm: r.utm,
      })
    ),
    adSpend: adSpend.map(
      (r): AdSpend => ({ date: String(r.date), platform: r.platform, amount: Number(r.amount) })
    ),
    finCategories: finCategories.map(
      (r): FinCategory => ({ id: r.id, groupName: r.group_name, name: r.name })
    ),
    finTransactions: finTransactions.map(
      (r): FinTransaction => ({
        id: r.id,
        transactionDate: String(r.transaction_date),
        amount: Number(r.amount),
        direction: r.direction,
        description: r.description,
        counterparty: r.counterparty,
        categoryId: r.category_id,
      })
    ),
    isDemo: false,
  };
}

// Cacheia a leitura pesada (44k leads + 12k vendas, paginadas no Supabase) por
// 60s no Data Cache do Next, compartilhada entre TODAS as páginas. A primeira
// carga paga o custo; as navegações seguintes reusam o resultado, então trocar
// de aba fica instantâneo. Os syncs (cron a cada 30min, webhooks) levam no
// máximo ~60s pra refletir — aceitável num painel de acompanhamento.
// 60s deixava quase todo acesso caindo em cache miss (e o miss é caro). Os
// syncs que alimentam essas tabelas rodam a cada 30 min no melhor caso, então
// 5 minutos não atrasa nada e transforma a navegação em instantânea.
const getCachedDashboardData = unstable_cache(
  fetchDashboardFromSupabase,
  ["dashboard-data-v2"],
  { revalidate: 300, tags: ["dashboard"] }
);

export async function getDashboardData(): Promise<DashboardData> {
  if (!supabaseConfigured()) {
    return generateDemoData();
  }
  return getCachedDashboardData();
}
