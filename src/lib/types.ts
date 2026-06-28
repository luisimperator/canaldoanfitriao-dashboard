// Modelo de dados do dashboard do Canal do Anfitrião.
// Espelha as tabelas em supabase/migrations/0001_schema.sql.

export type LeadSource = "meta_ads" | "google_ads" | "organico" | "outro";

// Funil do CRM no Unnichat: frio -> lista de espera -> quente -> convertido/perdido
export type LeadStatus =
  | "frio"
  | "lista_espera"
  | "quente"
  | "convertido"
  | "perdido";

export interface Seller {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Lead {
  id: string;
  createdAt: string; // ISO date (YYYY-MM-DD)
  source: LeadSource;
  status: LeadStatus;
  sellerId: string | null;
  /** etapa atual no pipeline do CRM (Unnichat) */
  pipelineStage?: string | null;
  name?: string | null;
  phone?: string | null;
  /** campos adicionais vindos do Unnichat (produto, atendente etc.) */
  extra?: Record<string, unknown> | null;
  /** origem do lead (utm_* + vidorigem) gravada no Mailchimp pela landing page */
  utm?: LeadUtm | null;
}

export interface LeadUtm {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  /** id ou nome do vídeo/podcast que trouxe o lead */
  vidorigem?: string | null;
}

export interface SaleUtm {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
}

export interface Sale {
  id: string;
  saleDate: string; // ISO date
  amount: number; // BRL
  sellerId: string;
  product: string;
  status: "paga" | "reembolsada";
  utm?: SaleUtm | null;
}

export interface AdSpend {
  date: string; // ISO date
  platform: "meta_ads" | "google_ads";
  amount: number; // BRL
}

export type FinDirection = "in" | "out";

export interface FinCategory {
  id: string;
  groupName: "Receitas" | "Despesas";
  name: string;
}

export interface FinTransaction {
  id: string;
  transactionDate: string; // ISO date
  amount: number; // sempre positivo; direção em `direction`
  direction: FinDirection;
  description: string;
  counterparty: string | null;
  categoryId: string | null;
}

export interface DashboardData {
  sellers: Seller[];
  leads: Lead[];
  sales: Sale[];
  adSpend: AdSpend[];
  finCategories: FinCategory[];
  finTransactions: FinTransaction[];
  /** true quando os dados vêm do gerador de demonstração (sem Supabase configurado) */
  isDemo: boolean;
}
