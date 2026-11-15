-- Controle de assinantes e grupos (especificação de 15/11).
--
-- A Eduzz é a fonte da verdade de status, vencimento, atraso e cancelamento:
-- assinaturas_eduzz é só uma cópia de consulta, sincronizada pela API
-- /myeduzz/v1/subscriptions. O painel guarda o que a Eduzz não tem: os vários
-- telefones e e-mails de cada pessoa, a cadeira extra ligada ao titular e a
-- fila de aprovar e remover nos grupos do WhatsApp (quem executa é o Foley).
--
-- A Black Friday Histórica (2025 e 2026, produto 2914907) é venda única na
-- Eduzz, não assinatura: entra na mesma cópia como tipo 'venda_unica', com
-- direito aos dois grupos por 4 anos a partir do pagamento.
--
-- Reaproveitado do que já existe: webhook_log (payload bruto da Eduzz),
-- eduzz_sales_raw (CPF, telefone e status das faturas) e o token da Eduzz que
-- já está guardado no cofre do Supabase.
--
-- Nunca apagar registro: troca, saída e cancelamento mudam status e ficam no
-- histórico. As tabelas abaixo recusam DELETE.
-- Dado de assinatura e telefone é confidencial: RLS ligada sem policy (só o
-- servidor, com a service role, lê e grava).

create extension if not exists pgcrypto;

-- ── Pessoas e contatos ─────────────────────────────────────────────────────

create table if not exists public.pessoas (
  id uuid primary key default gen_random_uuid(),
  nome text,
  cpf text,                 -- só dígitos
  email_eduzz text,         -- e-mail do comprador na Eduzz (minúsculo): liga com a Eduzz
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists pessoas_cpf_uq on public.pessoas (cpf) where cpf is not null;
create unique index if not exists pessoas_email_uq on public.pessoas (email_eduzz) where email_eduzz is not null;

create table if not exists public.contatos_pessoa (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id) on delete restrict,
  tipo text not null check (tipo in ('telefone', 'email')),
  valor text not null,      -- telefone: só dígitos, 55DDDNÚMERO; e-mail: minúsculo
  origem text not null check (origem in ('checkout_eduzz', 'pedido_troca', 'grupo_whatsapp', 'cadeira_extra', 'manual')),
  principal boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  desativado_em timestamptz,
  motivo text,
  unique (pessoa_id, tipo, valor)
);
-- Um principal por tipo por pessoa.
create unique index if not exists contatos_pessoa_um_principal on public.contatos_pessoa (pessoa_id, tipo) where principal and ativo;
create index if not exists contatos_pessoa_valor_idx on public.contatos_pessoa (tipo, valor) where ativo;

-- ── Cópia da Eduzz ─────────────────────────────────────────────────────────

create table if not exists public.assinaturas_eduzz (
  id uuid primary key default gen_random_uuid(),
  id_assinatura_eduzz text not null unique,  -- id da assinatura; na venda única, 'venda:<id da fatura>'
  tipo text not null default 'assinatura' check (tipo in ('assinatura', 'venda_unica')),
  pessoa_id uuid references public.pessoas(id) on delete restrict,  -- preenchido ao vincular
  produto_eduzz_id text,
  produto text,
  status text,               -- como vem da Eduzz (upToDate, late, canceled...; na venda: paid, refunded...)
  status_normalizado text check (status_normalizado in ('ativa', 'atrasada', 'cancelada', 'reembolsada', 'expirada')),
  inicio date,
  proximo_vencimento date,
  valor numeric,             -- valor da recorrência (na venda única, o total pago)
  cupom text,
  email_comprador text,
  id_primeira_fatura text,
  dados jsonb,               -- o item como veio da API
  sincronizado_em timestamptz not null default now()
);
create index if not exists assinaturas_eduzz_pessoa_idx on public.assinaturas_eduzz (pessoa_id);
create index if not exists assinaturas_eduzz_email_idx on public.assinaturas_eduzz (email_comprador);

-- Quais produtos da Eduzz liberam quais grupos. Um produto pode liberar mais
-- de um grupo (a Black libera os dois). cadeira_extra marca os produtos de
-- cadeira adicional, que liberam o grupo do titular.
create table if not exists public.produtos_grupos (
  id bigserial primary key,
  produto_eduzz_id text not null,
  produto text not null,
  grupo_jid text,            -- preenchido quando o Foley mandar os grupos
  nome_grupo text not null,
  cadeira_extra boolean not null default false,
  unique (produto_eduzz_id, nome_grupo)
);

create table if not exists public.cadeiras_extras (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid references public.pessoas(id) on delete restrict,     -- quem usa a cadeira (null até alguém dizer)
  titular_assinatura_id uuid references public.assinaturas_eduzz(id) on delete restrict,
  id_venda_eduzz text not null unique,   -- id da assinatura da cadeira na Eduzz
  ativa boolean not null default true,   -- segue o titular: titular inativo = cadeira inativa
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ── Grupos do WhatsApp ─────────────────────────────────────────────────────

create table if not exists public.excecoes_grupo (
  id bigserial primary key,
  telefone text not null unique,
  nome text,
  motivo text not null,      -- sócio, equipe, mentor...
  criado_em timestamptz not null default now(),
  criado_por text
);

create table if not exists public.membros_grupo (
  grupo_jid text not null,
  telefone text not null,
  visto_em timestamptz not null default now(),         -- última lista do Foley em que apareceu
  primeira_vez_em timestamptz not null default now(),
  primary key (grupo_jid, telefone)
);

create table if not exists public.acoes_grupo (
  id uuid primary key default gen_random_uuid(),
  grupo_jid text,
  pessoa_id uuid references public.pessoas(id) on delete restrict,
  telefone text not null,
  tipo text not null check (tipo in ('aprovar', 'recusar', 'remover', 'adicionar')),
  motivo text not null check (motivo ~ '^(assinatura_ativa|cadeira_extra|cancelou|reembolsou|atrasada_[0-9]+_dias|expirou|troca_numero|manual)$'),
  status text not null default 'pendente' check (status in ('pendente', 'aguardando_ok', 'executada', 'falhou', 'descartada')),
  pedida_por text,
  aprovada_por text,
  aprovada_em timestamptz,
  executada_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists acoes_grupo_status_idx on public.acoes_grupo (status, criado_em);

-- ── Histórico ──────────────────────────────────────────────────────────────

create table if not exists public.eventos (
  id bigserial primary key,
  pessoa_id uuid references public.pessoas(id) on delete restrict,
  tipo text not null,
  detalhe jsonb not null default '{}'::jsonb,
  feito_por text,            -- e-mail de quem fez no painel, ou 'eduzz' / 'foley' / 'sistema'
  criado_em timestamptz not null default now()
);
create index if not exists eventos_pessoa_idx on public.eventos (pessoa_id, criado_em desc);

-- ── Nunca apagar ───────────────────────────────────────────────────────────

create or replace function public.assinantes_sem_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Registro de % não se apaga: mude o status (e o motivo fica no histórico).', tg_table_name;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['pessoas', 'contatos_pessoa', 'assinaturas_eduzz', 'cadeiras_extras', 'acoes_grupo', 'eventos', 'membros_grupo', 'excecoes_grupo', 'produtos_grupos'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_sem_delete', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.assinantes_sem_delete()', t || '_sem_delete', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── Produtos que liberam grupo ─────────────────────────────────────────────

insert into public.produtos_grupos (produto_eduzz_id, produto, nome_grupo, cadeira_extra) values
  ('1783828', 'A5E', '[Membros] A5E', false),
  ('1702138', 'A5E', '[Membros] A5E', false),
  ('1760209', 'A5E (renovação do grupo)', '[Membros] A5E', false),
  ('2297739', 'Gigantes', 'Gigantes', false),
  ('2914907', 'Black Friday Histórica', '[Membros] A5E', false),
  ('2914907', 'Black Friday Histórica', 'Gigantes', false),
  ('2811180', 'Cadeira adicional A5E', '[Membros] A5E', true),
  ('1760222', 'Pessoa adicional A5E', '[Membros] A5E', true),
  ('2837267', 'Pessoa adicional Gigantes', 'Gigantes', true)
on conflict (produto_eduzz_id, nome_grupo) do nothing;

-- ── Funções ────────────────────────────────────────────────────────────────

-- Telefone em um formato só: 55DDDNÚMERO. Inválido → null.
create or replace function public.assin_norm_tel(p text)
returns text
language sql
immutable
as $$
  select case
    when d = '' then null
    when length(d) in (10, 11) and d !~ '^0' then '55' || d
    when length(d) in (12, 13) and d like '55%' then d
    when length(d) in (14, 15) and d like '5555%' then substr(d, 3)
    else null
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x;
$$;

-- Status da Eduzz → normalizado.
create or replace function public.assin_norm_status(p text)
returns text
language sql
immutable
as $$
  select case p
    when 'upToDate' then 'ativa'
    when 'paid' then 'ativa'
    when 'late' then 'atrasada'
    when 'overdue' then 'atrasada'
    when 'canceled' then 'cancelada'
    when 'cancelled' then 'cancelada'
    when 'suspended' then 'cancelada'
    when 'refunded' then 'reembolsada'
    when 'chargeback' then 'reembolsada'
    when 'waitingRefund' then 'reembolsada'
    when 'finished' then 'expirada'
    when 'expired' then 'expirada'
    else null
  end;
$$;

-- Grava (ou atualiza) um item da API de assinaturas na cópia. Não mexe no
-- vínculo com a pessoa.
create or replace function public.assin_gravar_item_eduzz(it jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_freq interval;
  v_cur date := nullif(it->'recurrence'->>'currentDue', '')::date;
  v_prox date;
begin
  v_freq := (coalesce(nullif(it->'recurrence'->'frequency'->>'value', '')::int, 1)
    || case it->'recurrence'->'frequency'->>'type' when 'monthly' then ' months' when 'weekly' then ' weeks' when 'daily' then ' days' else ' years' end)::interval;
  -- Próximo vencimento: o nextDue, quando a Eduzz manda. Senão, em dia com o
  -- vencimento atual já passado, o atual + 1 período; nos outros casos, o atual.
  v_prox := coalesce(nullif(it->'recurrence'->>'nextDue', '')::date,
    case when it->>'status' = 'upToDate' and v_cur <= current_date then (v_cur + v_freq)::date else v_cur end);
  insert into public.assinaturas_eduzz (id_assinatura_eduzz, tipo, produto_eduzz_id, produto, status, status_normalizado,
    inicio, proximo_vencimento, valor, cupom, email_comprador, id_primeira_fatura, dados, sincronizado_em)
  values (it->>'id', 'assinatura', it->'products'->0->>'id', it->'products'->0->>'title', it->>'status',
    public.assin_norm_status(it->>'status'),
    nullif(it->'recurrence'->>'startsAt', '')::date, v_prox,
    nullif(it->'payment'->'price'->>'value', '')::numeric, null,
    lower(nullif(trim(it->'client'->>'email'), '')), it->>'firstInvoiceId', it, now())
  on conflict (id_assinatura_eduzz) do update set
    produto_eduzz_id = excluded.produto_eduzz_id, produto = excluded.produto, status = excluded.status,
    status_normalizado = excluded.status_normalizado, inicio = excluded.inicio,
    proximo_vencimento = excluded.proximo_vencimento, valor = excluded.valor,
    cupom = coalesce(excluded.cupom, assinaturas_eduzz.cupom), email_comprador = excluded.email_comprador,
    id_primeira_fatura = excluded.id_primeira_fatura, dados = excluded.dados, sincronizado_em = now();
end;
$$;

-- Puxa da API da Eduzz as páginas p_ini..p_fim (15 assinaturas por página).
create or replace function public.assin_sync_eduzz(p_ini integer default 1, p_fim integer default 30)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
set statement_timeout to '600000'
as $$
declare
  v_tok text;
  v_page integer := p_ini;
  v_pages integer := p_fim;
  v_status integer;
  v_resp jsonb;
  v_it jsonb;
  v_total integer := 0;
begin
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'eduzz_access_token';
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '10000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '30000');
  while v_page <= least(p_fim, v_pages) loop
    select status, content::jsonb into v_status, v_resp
    from extensions.http(('GET',
      'https://api.eduzz.com/myeduzz/v1/subscriptions?page=' || v_page || '&itemsPerPage=15&filterBy=creation&startDate=2015-01-01&endDate=' || (current_date + 1),
      array[extensions.http_header('Authorization', 'Bearer ' || v_tok), extensions.http_header('Accept', 'application/json')],
      null, null)::extensions.http_request);
    exit when v_status <> 200;
    v_pages := coalesce((v_resp->>'pages')::int, v_page);
    for v_it in select * from jsonb_array_elements(coalesce(v_resp->'items', '[]'::jsonb)) loop
      perform public.assin_gravar_item_eduzz(v_it);
      v_total := v_total + 1;
    end loop;
    v_page := v_page + 1;
  end loop;
  return jsonb_build_object('gravadas', v_total, 'ultima_pagina', v_page - 1, 'paginas', v_pages, 'status_http', v_status);
end;
$$;

-- Black Friday Histórica (venda única): copia as faturas da Black já
-- sincronizadas em eduzz_sales_raw. Direito: 4 anos a partir do pagamento.
create or replace function public.assin_sync_black()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  insert into public.assinaturas_eduzz (id_assinatura_eduzz, tipo, produto_eduzz_id, produto, status, status_normalizado,
    inicio, proximo_vencimento, valor, cupom, email_comprador, id_primeira_fatura, dados, sincronizado_em)
  select 'venda:' || r.id, 'venda_unica', r.data->'product'->>'id', r.data->'product'->>'name', r.status,
    case when public.assin_norm_status(r.status) = 'ativa' and (r.paid_at + interval '4 years')::date < current_date then 'expirada'
         else public.assin_norm_status(r.status) end,
    r.paid_at::date, (r.paid_at + interval '4 years')::date,
    nullif(r.data->'total'->>'value', '')::numeric, null,
    lower(nullif(trim(r.data->'buyer'->>'email'), '')), r.id, r.data, now()
  from public.eduzz_sales_raw r
  where r.data->'product'->>'id' = '2914907' and r.paid_at is not null
  on conflict (id_assinatura_eduzz) do update set
    status = excluded.status, status_normalizado = excluded.status_normalizado,
    proximo_vencimento = excluded.proximo_vencimento, valor = excluded.valor,
    cupom = coalesce(excluded.cupom, assinaturas_eduzz.cupom), dados = excluded.dados, sincronizado_em = now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Cupom: a API de assinaturas e a de vendas não trazem; só o webhook da
-- fatura paga (desde junho/2026). Preenche de uma vez pela primeira fatura.
create or replace function public.assin_preencher_cupons()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  update public.assinaturas_eduzz a set cupom = x.cupom
  from (
    select distinct on (fatura) fatura, cupom from (
      select w.body->'data'->>'id' fatura, w.id,
        case jsonb_typeof(c) when 'string' then c #>> '{}' when 'object' then coalesce(c->>'code', c->>'key', c->>'name') end cupom
      from public.webhook_log w,
        lateral (select coalesce(nullif(w.body->'data'->'items'->0->'coupon', 'null'::jsonb), w.body->'data'->'items'->0->'price'->'coupon') c) cc
      where w.source = 'eduzz' and w.note = 'myeduzz.invoice_paid'
    ) y where cupom is not null
    order by fatura, id desc
  ) x
  where x.fatura = a.id_primeira_fatura and a.cupom is distinct from x.cupom;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Liga a cópia da Eduzz a pessoas e contatos. Junta pessoa por CPF ou e-mail;
-- telefone igual em duas pessoas NÃO junta (vira sugestão de merge).
-- p_gravar = false (modo teste): só devolve o resumo, sem gravar nada.
create or replace function public.assin_vincular(p_gravar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '600000'
as $$
declare
  v_res jsonb;
begin
  -- Uma linha por assinatura/venda, com e-mail, CPF, nome e telefone.
  -- CPF e telefone da fatura (eduzz_sales_raw) completam o que a API de
  -- assinaturas não traz.
  create temporary table _a on commit drop as
  select a.id, a.id_assinatura_eduzz, a.tipo, a.produto_eduzz_id, a.status_normalizado, a.sincronizado_em,
    coalesce(a.email_comprador, lower(nullif(trim(r.data->'buyer'->>'email'), ''))) email,
    nullif(regexp_replace(coalesce(r.data->'buyer'->>'document', ''), '\D', '', 'g'), '') cpf,
    coalesce(nullif(trim(a.dados->'client'->>'name'), ''), nullif(trim(r.data->'buyer'->>'name'), '')) nome,
    public.assin_norm_tel(case when a.tipo = 'assinatura' then
        coalesce(a.dados->'client'->'phone'->>'countryCode', '') || coalesce(a.dados->'client'->'phone'->>'areaCode', '') || coalesce(a.dados->'client'->'phone'->>'number', '')
      end) tel_assinatura,
    public.assin_norm_tel(r.data->'buyer'->>'phone') tel_fatura,
    coalesce(nullif(a.dados->>'updatedAt', '')::timestamptz, nullif(a.dados->>'createdAt', '')::timestamptz, r.paid_at, a.sincronizado_em) recencia,
    coalesce(pg.cadeira_extra, false) cadeira,
    pg.produto_eduzz_id is not null libera_grupo
  from public.assinaturas_eduzz a
  left join public.eduzz_sales_raw r on r.id = a.id_primeira_fatura
  left join lateral (select p.produto_eduzz_id, bool_or(p.cadeira_extra) cadeira_extra from public.produtos_grupos p
                     where p.produto_eduzz_id = a.produto_eduzz_id group by 1) pg on true;

  -- Chave da pessoa: o CPF (de qualquer linha com aquele e-mail), senão o e-mail.
  alter table _a add column chave text;
  update _a set chave = coalesce(
    (select max(b.cpf) from _a b where b.email = _a.email and b.cpf is not null),
    cpf,
    'email:' || email);

  create temporary table _p on commit drop as
  select distinct on (chave) chave, nome,
    case when chave like 'email:%' then null else chave end cpf,
    email
  from _a where chave is not null
  order by chave, recencia desc nulls last;

  create temporary table _t on commit drop as
  select chave, tel, max(recencia) recencia from (
    select chave, tel_assinatura tel, recencia from _a where tel_assinatura is not null and chave is not null
    union all
    select chave, tel_fatura, recencia from _a where tel_fatura is not null and chave is not null
  ) x group by 1, 2;

  create temporary table _e on commit drop as
  select chave, email, max(recencia) recencia from _a where email is not null and chave is not null group by 1, 2;

  select jsonb_build_object(
    'modo', case when p_gravar then 'gravado' else 'teste (nada gravado)' end,
    'copia_eduzz', jsonb_build_object(
      'assinaturas', (select count(*) from public.assinaturas_eduzz where tipo = 'assinatura'),
      'vendas_black', (select count(*) from public.assinaturas_eduzz where tipo = 'venda_unica'),
      'por_status', (select jsonb_object_agg(coalesce(s, 'sem_status'), n) from (select status || ' → ' || coalesce(status_normalizado, '?') s, count(*) n from public.assinaturas_eduzz group by 1) x)),
    'que_liberam_grupo', jsonb_build_object(
      'linhas', (select count(*) from _a where libera_grupo),
      'ativas_ou_atrasadas', (select count(*) from _a where libera_grupo and status_normalizado in ('ativa', 'atrasada')),
      'por_produto', (select jsonb_object_agg(produto, n) from (select coalesce(pg.produto, a.produto_eduzz_id) || ' · ' || coalesce(a.status_normalizado, '?') produto, count(*) n
                      from _a a left join lateral (select p.produto from public.produtos_grupos p where p.produto_eduzz_id = a.produto_eduzz_id limit 1) pg on true
                      where a.libera_grupo group by 1) x),
      'cadeiras_extras', (select count(*) from _a where cadeira),
      'cadeiras_ativas', (select count(*) from _a where cadeira and status_normalizado in ('ativa', 'atrasada'))),
    'produtos_sem_grupo', (select jsonb_object_agg(coalesce(produto, '?'), n) from (select a.produto_eduzz_id || ' ' || coalesce(e.produto, '') produto, count(*) n
                      from _a a join public.assinaturas_eduzz e on e.id = a.id where not a.libera_grupo group by 1) x),
    'pessoas', (select count(*) from _p),
    'pessoas_com_cpf', (select count(*) from _p where cpf is not null),
    'pessoas_so_email', (select count(*) from _p where cpf is null),
    'pessoas_com_direito_hoje', (select count(distinct chave) from _a where libera_grupo and not cadeira and status_normalizado in ('ativa', 'atrasada')),
    'linhas_sem_email_nem_cpf', (select count(*) from _a where chave is null),
    'telefones', (select count(*) from _t),
    'pessoas_com_mais_de_um_telefone', (select count(*) from (select chave from _t group by 1 having count(*) > 1) x),
    'pessoas_sem_telefone', (select count(*) from _p p where not exists (select 1 from _t t where t.chave = p.chave)),
    'pessoas_com_mais_de_um_email', (select count(*) from (select chave from _e group by 1 having count(*) > 1) x),
    'possiveis_duplicados', (select count(*) from (select tel from _t group by tel having count(distinct chave) > 1) d),
    'pessoas_envolvidas_em_duplicados', (select count(distinct chave) from _t where tel in (select tel from _t group by tel having count(distinct chave) > 1))
  ) into v_res;

  if p_gravar then
    -- Pessoas
    insert into public.pessoas (nome, cpf, email_eduzz)
    select p.nome, p.cpf, p.email from _p p
    where not exists (select 1 from public.pessoas x where (p.cpf is not null and x.cpf = p.cpf) or (p.email is not null and x.email_eduzz = p.email));

    alter table _p add column pessoa_id uuid;
    update _p set pessoa_id = (select x.id from public.pessoas x
      where (_p.cpf is not null and x.cpf = _p.cpf) or (_p.email is not null and x.email_eduzz = _p.email)
      order by (x.cpf = _p.cpf) desc nulls last limit 1);

    -- Contatos do checkout: o mais recente de cada tipo vira o principal, se a
    -- pessoa ainda não tiver um.
    insert into public.contatos_pessoa (pessoa_id, tipo, valor, origem, principal)
    select p.pessoa_id, 'telefone', t.tel, 'checkout_eduzz',
      row_number() over (partition by t.chave order by t.recencia desc nulls last) = 1
        and not exists (select 1 from public.contatos_pessoa c where c.pessoa_id = p.pessoa_id and c.tipo = 'telefone' and c.principal and c.ativo)
    from _t t join _p p on p.chave = t.chave
    on conflict (pessoa_id, tipo, valor) do nothing;

    insert into public.contatos_pessoa (pessoa_id, tipo, valor, origem, principal)
    select p.pessoa_id, 'email', e.email, 'checkout_eduzz',
      row_number() over (partition by e.chave order by e.recencia desc nulls last) = 1
        and not exists (select 1 from public.contatos_pessoa c where c.pessoa_id = p.pessoa_id and c.tipo = 'email' and c.principal and c.ativo)
    from _e e join _p p on p.chave = e.chave
    on conflict (pessoa_id, tipo, valor) do nothing;

    -- Vínculo da cópia com a pessoa
    update public.assinaturas_eduzz s set pessoa_id = p.pessoa_id
    from _a a join _p p on p.chave = a.chave
    where s.id = a.id and s.pessoa_id is distinct from p.pessoa_id;

    -- Cadeiras extras: a assinatura da cadeira fica ligada à assinatura
    -- principal mais recente do mesmo comprador no mesmo grupo. Quem usa a
    -- cadeira (pessoa_id) fica em branco até alguém dizer no painel.
    insert into public.cadeiras_extras (titular_assinatura_id, id_venda_eduzz, ativa)
    select (select t.id from public.assinaturas_eduzz t
              join public.produtos_grupos tg on tg.produto_eduzz_id = t.produto_eduzz_id and not tg.cadeira_extra
              join public.produtos_grupos cg on cg.produto_eduzz_id = c.produto_eduzz_id and cg.nome_grupo = tg.nome_grupo
             where t.pessoa_id = c.pessoa_id
             order by (t.status_normalizado in ('ativa', 'atrasada')) desc, t.proximo_vencimento desc nulls last limit 1),
      c.id_assinatura_eduzz,
      c.status_normalizado in ('ativa', 'atrasada')
    from public.assinaturas_eduzz c
    join _a a on a.id = c.id and a.cadeira
    on conflict (id_venda_eduzz) do nothing;

    insert into public.eventos (tipo, detalhe, feito_por) values ('importacao', v_res, 'sistema');
  end if;

  return v_res;
end;
$$;

revoke all on function public.assin_gravar_item_eduzz(jsonb) from public, anon, authenticated;
revoke all on function public.assin_sync_eduzz(integer, integer) from public, anon, authenticated;
revoke all on function public.assin_sync_black() from public, anon, authenticated;
revoke all on function public.assin_vincular(boolean) from public, anon, authenticated;
revoke all on function public.assin_preencher_cupons() from public, anon, authenticated;
grant execute on function public.assin_preencher_cupons() to service_role;
grant execute on function public.assin_sync_eduzz(integer, integer) to service_role;
grant execute on function public.assin_sync_black() to service_role;
grant execute on function public.assin_vincular(boolean) to service_role;
