-- Entrega TMB → Eduzz/Nutror (Black Friday Histórica 2026).
--
-- A Black é vendida na Eduzz (produto 2914907, entrega sozinha na Nutror) e na
-- TMB (parcelado em 12x, que não entrega nada). Este módulo recebe os pedidos
-- da TMB e, quando a 1ª parcela de um pedido da Black é paga, garante que o
-- comprador tenha o pacote "Black Friday Histórica do Canal do Anfitrião" na
-- Nutror — pela Entrega Manual do produto 2914907 da Eduzz.
--
-- tmb_config   uma linha: modo teste (começa LIGADO), produto da Eduzz, pacote
--              da Nutror, produto/data da Black na TMB e destino dos avisos.
-- tmb_eventos  todo aviso recebido da TMB (e as simulações), com o payload bruto.
-- tmb_entregas uma linha por pedido da Black, com o estado da entrega.
--
-- Idempotência: um pedido tem uma linha só (pedido_id único) e um e-mail não
-- pode ter duas linhas "entregue"/"pendente" (índice único parcial), então
-- dois avisos simultâneos não geram dois pedidos de entrega.

create table if not exists public.tmb_config (
  id int primary key default 1 check (id = 1),
  modo_teste boolean not null default true,
  eduzz_produto_id text not null default '2914907',
  pacote_nutror_hash text not null default '693c0511f00f2a73bbf1c821e36a459c3a8e3576',
  pacote_nutror_titulo text not null default 'Black Friday Histórica do Canal do Anfitrião',
  -- Regex (sem diferenciar maiúsculas) aplicada ao produto + oferta do pedido da TMB.
  filtro_black text not null default 'black',
  -- Produto da Black na TMB. É o MESMO id da Black de 2025 (27029), então
  -- só conta pedido criado/efetivado a partir de black_desde: as parcelas da
  -- Black antiga continuam chegando e não podem disparar entrega do pacote novo.
  tmb_produto_id text default '27029',
  black_desde date not null default '2026-10-28',
  -- Telefones (com DDI) que recebem os avisos pelo WhatsApp do Canal.
  aviso_telefones text[] not null default '{}',
  -- Template de utilidade com 1 parâmetro, usado quando o texto livre não sai
  -- (janela de 24h fechada). Sem ele, o aviso fica só no painel.
  aviso_template_id text,
  ultima_varredura timestamptz,
  ultima_varredura_resumo text,
  atualizado_em timestamptz not null default now()
);
insert into public.tmb_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.tmb_eventos (
  id bigserial primary key,
  pedido_id text,
  evento text,
  email text,
  nome text,
  telefone text,
  produto text,
  oferta text,
  status text,
  valor numeric,
  parcela_paga int,
  payload jsonb not null,
  origem text not null default 'webhook' check (origem in ('webhook', 'varredura', 'simulacao')),
  resultado text,
  recebido_em timestamptz not null default now()
);
create index if not exists tmb_eventos_pedido on public.tmb_eventos (pedido_id);
create index if not exists tmb_eventos_email on public.tmb_eventos (lower(email));
create index if not exists tmb_eventos_recebido on public.tmb_eventos (recebido_em desc);

create table if not exists public.tmb_entregas (
  id bigserial primary key,
  pedido_id text not null unique,
  email text not null,
  nome text,
  telefone text,
  produto text,
  valor numeric,
  -- aguardando: pedido sem a 1ª parcela paga
  -- pendente:   precisa da Entrega Manual na Eduzz (a API da Eduzz não tem
  --             esse recurso; o time faz no painel e a matrícula confirma)
  -- simulado:   modo teste, mostra o que faria
  -- entregue:   matrícula no pacote confirmada (ou marcada à mão)
  -- ja_tinha / erro
  status text not null check (status in ('aguardando', 'pendente', 'simulado', 'entregue', 'ja_tinha', 'erro')),
  detalhe text,
  bloqueado boolean not null default false,
  pedido_status text,
  parcela_paga int,
  cancelado_em timestamptz,
  tentativas int not null default 0,
  entregue_em timestamptz,
  confirmado_em timestamptz,
  teste boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists tmb_entregas_um_por_email
  on public.tmb_entregas (lower(email)) where status in ('entregue', 'pendente') and not teste;
create index if not exists tmb_entregas_email on public.tmb_entregas (lower(email));

-- Só o servidor (service role) lê e escreve.
alter table public.tmb_config enable row level security;
alter table public.tmb_eventos enable row level security;
alter table public.tmb_entregas enable row level security;

-- Matrículas no pacote da Black: a Eduzz já manda pro painel (webhook_log,
-- source 'eduzz') todo nutror.enrollment_created. Índice pra achar rápido
-- por e-mail do aluno.
create index if not exists webhook_log_nutror_email
  on public.webhook_log (lower(body -> 'data' -> 'learner' ->> 'email'))
  where source = 'eduzz' and note = 'nutror.enrollment_created';

-- Primeira matrícula do e-mail no pacote (pelo hash do conteúdo na Nutror),
-- ou null se não houver.
create or replace function public.tmb_matricula_pacote(p_email text, p_hash text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select min(created_at)
  from public.webhook_log
  where source = 'eduzz'
    and note = 'nutror.enrollment_created'
    and lower(body -> 'data' -> 'learner' ->> 'email') = lower(trim(p_email))
    and (
      body -> 'data' -> 'content' ->> 'hash' = p_hash
      or (body -> 'data' -> 'courses') @> jsonb_build_array(jsonb_build_object('hash', p_hash))
    );
$$;
revoke all on function public.tmb_matricula_pacote(text, text) from public, anon, authenticated;

-- Último aviso da Nutror de aluno inativo/bloqueado pra esse e-mail (só chega
-- se o evento estiver assinado no webhook da Eduzz). Serve pra registrar e
-- avisar; o módulo nunca mexe em acesso bloqueado.
create or replace function public.tmb_nutror_bloqueio(p_email text)
returns table (evento text, em timestamptz)
language sql
stable
set search_path = public
as $$
  select note, created_at
  from public.webhook_log
  where source = 'eduzz'
    and note like 'nutror.%'
    and note <> 'nutror.enrollment_created'
    and note ~* '(inativ|inactiv|bloq|block|suspen)'
    and lower(body -> 'data' -> 'learner' ->> 'email') = lower(trim(p_email))
  order by created_at desc
  limit 1;
$$;
revoke all on function public.tmb_nutror_bloqueio(text) from public, anon, authenticated;
grant execute on function public.tmb_matricula_pacote(text, text) to service_role;
grant execute on function public.tmb_nutror_bloqueio(text) to service_role;
