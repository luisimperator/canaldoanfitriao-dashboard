-- Notificação de venda nova no celular (web push).
--
-- push_assinaturas: um aparelho/navegador que ativou o aviso no painel.
-- vendas_notificadas: trava pra não avisar a mesma venda duas vezes
-- (a Eduzz reenvia webhook, a TMB manda "vendas" e "financeiro" do mesmo
-- pedido). A chave é 'eduzz:<fatura>' ou 'tmb:<pedido>'.
-- As duas tabelas só são lidas pelo servidor (service role): RLS ligado e
-- nenhuma policy.

create table if not exists public.push_assinaturas (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  email text,
  user_agent text,
  criado_em timestamptz not null default now(),
  ultimo_envio_em timestamptz
);
alter table public.push_assinaturas enable row level security;

create table if not exists public.vendas_notificadas (
  chave text primary key,
  notificado_em timestamptz not null default now()
);
alter table public.vendas_notificadas enable row level security;

-- O que já existe não é venda nova: marca como avisado pra um reenvio de
-- webhook antigo não disparar aviso.
insert into public.vendas_notificadas (chave)
select 'eduzz:' || eduzz_invoice_id from public.sales where eduzz_invoice_id is not null
on conflict do nothing;
insert into public.vendas_notificadas (chave)
select 'tmb:' || pedido_id from public.tmb_pedidos_raw where pedido_id is not null
on conflict do nothing;
insert into public.vendas_notificadas (chave)
select distinct 'tmb:' || pedido_id from public.tmb_eventos
where pedido_id is not null and pedido_id not like 'TESTE-%'
on conflict do nothing;

-- Chaves VAPID do web push, geradas pelo próprio servidor no primeiro uso
-- (src/lib/push.ts). Linha única (id = 1); só o service role lê.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  criado_em timestamptz not null default now()
);
alter table public.push_config enable row level security;
