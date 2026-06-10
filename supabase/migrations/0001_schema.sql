-- Schema do dashboard do Canal do Anfitrião.
-- Segue o mesmo padrão do projeto "Financial Dashboard" existente
-- (transactions/categories/source_files), mais as tabelas do funil de vendas.

create extension if not exists "uuid-ossp" with schema extensions;

-- ========== Funil de vendas ==========

create table public.sellers (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default extensions.uuid_generate_v4(),
  created_at date not null default current_date,
  name text,
  email text,
  phone text,
  source text not null default 'outro'
    check (source in ('meta_ads', 'google_ads', 'organico', 'outro')),
  status text not null default 'frio'
    check (status in ('frio', 'lista_espera', 'quente', 'convertido', 'perdido')),
  seller_id uuid references public.sellers(id),
  -- ids externos para reconciliar com as ferramentas de origem
  mailchimp_id text unique,
  unnichat_id text unique,
  updated_at timestamptz not null default now()
);

create index leads_created_at_idx on public.leads (created_at);
create index leads_status_idx on public.leads (status);

create table public.sales (
  id uuid primary key default extensions.uuid_generate_v4(),
  sale_date date not null,
  amount numeric not null,
  product text not null default 'Canal do Anfitrião',
  status text not null default 'paga' check (status in ('paga', 'reembolsada')),
  seller_id uuid references public.sellers(id),
  lead_id uuid references public.leads(id),
  -- id da fatura na Eduzz, para o webhook/sync não duplicar
  eduzz_invoice_id text unique,
  created_at timestamptz not null default now()
);

create index sales_sale_date_idx on public.sales (sale_date);

create table public.ad_spend (
  id uuid primary key default extensions.uuid_generate_v4(),
  date date not null,
  platform text not null check (platform in ('meta_ads', 'google_ads')),
  amount numeric not null,
  campaign text,
  created_at timestamptz not null default now(),
  unique (date, platform, campaign)
);

-- ========== Financeiro ==========

create table public.fin_categories (
  id uuid primary key default extensions.uuid_generate_v4(),
  group_name text not null check (group_name in ('Receitas', 'Despesas')),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.fin_source_files (
  id uuid primary key default extensions.uuid_generate_v4(),
  filename text not null,
  file_type text not null check (file_type in ('ofx', 'csv', 'api_inter', 'manual')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'error')),
  error_message text,
  uploaded_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.fin_transactions (
  id uuid primary key default extensions.uuid_generate_v4(),
  transaction_date date not null,
  amount numeric not null check (amount >= 0),
  direction text not null check (direction in ('in', 'out')),
  description text not null,
  counterparty text,
  category_id uuid references public.fin_categories(id),
  source_file_id uuid references public.fin_source_files(id),
  -- FITID do OFX / id do lançamento na API do Inter, para evitar duplicidade
  external_id text unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fin_transactions_date_idx on public.fin_transactions (transaction_date);

-- ========== RLS ==========
-- Leitura liberada para o dashboard (anon); escrita apenas via service_role
-- (webhooks e syncs rodam no servidor com a service key).

alter table public.sellers enable row level security;
alter table public.leads enable row level security;
alter table public.sales enable row level security;
alter table public.ad_spend enable row level security;
alter table public.fin_categories enable row level security;
alter table public.fin_source_files enable row level security;
alter table public.fin_transactions enable row level security;

create policy "leitura anon" on public.sellers for select using (true);
create policy "leitura anon" on public.leads for select using (true);
create policy "leitura anon" on public.sales for select using (true);
create policy "leitura anon" on public.ad_spend for select using (true);
create policy "leitura anon" on public.fin_categories for select using (true);
create policy "leitura anon" on public.fin_source_files for select using (true);
create policy "leitura anon" on public.fin_transactions for select using (true);

-- ========== Dados iniciais ==========

insert into public.sellers (name) values ('Vendedor A'), ('Vendedor B');

insert into public.fin_categories (group_name, name) values
  ('Receitas', 'Vendas Eduzz'),
  ('Receitas', 'Outras receitas'),
  ('Despesas', 'Tráfego (Meta/Google Ads)'),
  ('Despesas', 'Comissões de vendedores'),
  ('Despesas', 'Ferramentas (Unnichat, Mailchimp...)'),
  ('Despesas', 'Impostos'),
  ('Despesas', 'Outras despesas');
