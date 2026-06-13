// Gerador determinístico de dados de demonstração.
// Usado quando o Supabase ainda não está configurado, para que o dashboard
// renderize com números realistas (mesma forma dos dados reais).

import type {
  AdSpend,
  DashboardData,
  FinCategory,
  FinTransaction,
  Lead,
  LeadSource,
  LeadStatus,
  Sale,
  Seller,
} from "./types";

const HISTORY_MONTHS = 8;

// PRNG determinístico (mulberry32) para que o demo seja estável entre renders.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const SELLERS: Seller[] = [
  { id: "v1", name: "Vendedor A", isActive: true },
  { id: "v2", name: "Vendedor B", isActive: true },
];

const FIN_CATEGORIES: FinCategory[] = [
  { id: "c-vendas", groupName: "Receitas", name: "Vendas Eduzz" },
  { id: "c-trafego", groupName: "Despesas", name: "Tráfego (Meta/Google Ads)" },
  { id: "c-comissao", groupName: "Despesas", name: "Comissões de vendedores" },
  { id: "c-ferramentas", groupName: "Despesas", name: "Ferramentas (Unnichat, Mailchimp...)" },
  { id: "c-impostos", groupName: "Despesas", name: "Impostos" },
  { id: "c-outros", groupName: "Despesas", name: "Outras despesas" },
];

export function generateDemoData(today = new Date()): DashboardData {
  const rand = mulberry32(20260610);
  const start = new Date(today);
  start.setMonth(start.getMonth() - HISTORY_MONTHS);

  const leads: Lead[] = [];
  const sales: Sale[] = [];
  const adSpend: AdSpend[] = [];
  const finTransactions: FinTransaction[] = [];

  let leadSeq = 0;
  let saleSeq = 0;

  const monthlyRevenue = new Map<string, number>(); // p/ lançamentos financeiros

  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    const dayIso = iso(date);
    const monthsIn = (date.getTime() - start.getTime()) / (1000 * 3600 * 24 * 30);

    // Volume de leads: base ~22/dia crescendo devagar, mais fraco no fim de semana.
    const weekday = date.getDay();
    const weekendFactor = weekday === 0 || weekday === 6 ? 0.55 : 1;
    const base = (22 + monthsIn * 1.6) * weekendFactor;
    const dayLeads = Math.max(2, Math.round(base * (0.7 + rand() * 0.6)));

    for (let i = 0; i < dayLeads; i++) {
      const r = rand();
      const source: LeadSource =
        r < 0.74 ? "meta_ads" : r < 0.86 ? "google_ads" : r < 0.96 ? "organico" : "outro";

      // Funil: ~52% ficam frios/lista de espera, ~48% viram quentes;
      // dos quentes, ~22% convertem => ~1 venda a cada ~9-10 leads.
      const f = rand();
      let status: LeadStatus;
      let sellerId: string | null = null;
      let tags: string[] | null = null;
      if (f < 0.32) {
        status = "frio";
      } else if (f < 0.52) {
        status = "lista_espera";
        // Lista de espera vem do Mailchimp já dividida por tag (motivo do
        // atendimento ativo). Distribui entre os três baldes do time de vendas.
        const t = rand();
        tags = [
          t < 0.5
            ? "lista-de-espera"
            : t < 0.8
              ? "gigantes-super-interessados"
              : "precisa de ajuda",
        ];
      } else {
        sellerId = rand() < 0.5 ? "v1" : "v2";
        const c = rand();
        // Vendedor A converte um pouco melhor que o B (para o ranking ter graça)
        const convRate = sellerId === "v1" ? 0.25 : 0.2;
        if (c < convRate) status = "convertido";
        else if (c < convRate + 0.35) status = "quente";
        else status = "perdido";
      }

      leads.push({
        id: `lead-${++leadSeq}`,
        createdAt: dayIso,
        source,
        status,
        sellerId,
        extra: tags ? { tags } : null,
      });

      if (status === "convertido" && sellerId) {
        // Venda fecha de 0 a 5 dias depois da captação
        const saleDate = new Date(date);
        saleDate.setDate(saleDate.getDate() + Math.floor(rand() * 6));
        if (saleDate > today) saleDate.setTime(today.getTime());
        const p = rand();
        const amount = p < 0.15 ? 997 : p < 0.9 ? 1497 : 2497;
        const refunded = rand() < 0.04;
        sales.push({
          id: `sale-${++saleSeq}`,
          saleDate: iso(saleDate),
          amount,
          sellerId,
          product: "Canal do Anfitrião",
          status: refunded ? "reembolsada" : "paga",
        });
        if (!refunded) {
          const mk = iso(saleDate).slice(0, 7);
          monthlyRevenue.set(mk, (monthlyRevenue.get(mk) ?? 0) + amount);
        }
      }
    }

    // Investimento diário em tráfego (quase tudo Meta Ads)
    adSpend.push({
      date: dayIso,
      platform: "meta_ads",
      amount: Math.round((380 + monthsIn * 28) * (0.75 + rand() * 0.5)),
    });
    if (rand() < 0.7) {
      adSpend.push({
        date: dayIso,
        platform: "google_ads",
        amount: Math.round(45 * (0.5 + rand())),
      });
    }
  }

  // Financeiro: lançamentos mensais derivados da operação
  let finSeq = 0;
  const pushFin = (t: Omit<FinTransaction, "id">) =>
    finTransactions.push({ id: `fin-${++finSeq}`, ...t });

  for (const [month, revenue] of monthlyRevenue) {
    const [y, m] = month.split("-").map(Number);
    const receiptDay = new Date(y, m - 1, 28 > new Date(y, m, 0).getDate() ? 25 : 28);
    if (receiptDay > today) continue;
    const dayIso = iso(receiptDay);

    // Eduzz repassa a receita menos a taxa da plataforma (~9,9%)
    pushFin({
      transactionDate: dayIso,
      amount: Math.round(revenue * 0.901),
      direction: "in",
      description: `Repasse Eduzz ${month}`,
      counterparty: "Eduzz",
      categoryId: "c-vendas",
    });
    pushFin({
      transactionDate: dayIso,
      amount: Math.round(revenue * 0.1),
      direction: "out",
      description: `Comissões de vendas ${month}`,
      counterparty: "Vendedores",
      categoryId: "c-comissao",
    });
    pushFin({
      transactionDate: dayIso,
      amount: Math.round(revenue * 0.06),
      direction: "out",
      description: `Impostos ${month}`,
      counterparty: "DAS / Receita Federal",
      categoryId: "c-impostos",
    });

    const monthSpend = adSpend
      .filter((s) => s.date.startsWith(month))
      .reduce((acc, s) => acc + s.amount, 0);
    pushFin({
      transactionDate: dayIso,
      amount: monthSpend,
      direction: "out",
      description: `Tráfego pago ${month}`,
      counterparty: "Meta / Google",
      categoryId: "c-trafego",
    });
    pushFin({
      transactionDate: dayIso,
      amount: 890,
      direction: "out",
      description: `Ferramentas ${month}`,
      counterparty: "Unnichat / Mailchimp / outros",
      categoryId: "c-ferramentas",
    });
  }

  return {
    sellers: SELLERS,
    leads,
    sales,
    adSpend,
    finCategories: FIN_CATEGORIES,
    finTransactions,
    isDemo: true,
  };
}
