-- 0002_tmb_pedidos_integration.sql
-- Integração TMB Educação (vendas parceladas / boleto): puxa /api/pedidos da
-- API REST da TMB e grava no Supabase. Espelha o padrão da Eduzz:
-- tabela "raw" + função que pagina a API (lendo o token do Vault) + cron diário.
--
-- Pré-requisito: secret `tmb_access_token` no Vault (Bearer token do Portal do
-- Produtor da TMB -> Produtos -> TMB API).
--
-- Notas da API:
--  * GET https://api.tmbeducacao.com.br/api/pedidos -> resposta paginada
--    { pageNumber, totalPages, totalRecords, data:[ ...pedidos... ] }
--  * status_financeiro: Adimplente | Inadimplente | Quitado
--  * A API REJEITA intervalos de data grandes (HTTP 400); por isso a função
--    fatiia o período em janelas de 60 dias.

create table if not exists public.tmb_pedidos_raw (
  pedido_id            bigint primary key,
  data                 jsonb not null,
  status_pedido        text,
  status_financeiro    text,            -- Adimplente / Inadimplente / Quitado
  produto_id           bigint,
  lancamento           text,            -- nome do produto
  cliente              text,
  email                text,
  valor_total          numeric,
  parcelas             integer,
  valor_entrada        numeric,
  valor_parcela        numeric,
  taxa_administracao   numeric,
  melhor_dia_pagamento integer,
  criado_em            timestamptz,
  data_efetivado       timestamp,
  updated_at           timestamptz not null default now()
);

alter table public.tmb_pedidos_raw enable row level security;

create index if not exists tmb_pedidos_status_fin_idx on public.tmb_pedidos_raw (status_financeiro);
create index if not exists tmb_pedidos_criado_idx     on public.tmb_pedidos_raw (criado_em);
create index if not exists tmb_pedidos_produto_idx    on public.tmb_pedidos_raw (produto_id);

create or replace function public.sync_tmb_pedidos(p_start date, p_end date)
returns integer
language plpgsql
security definer
set search_path to 'public','extensions','vault'
set statement_timeout to '600000'
as $function$
declare
  v_tok       text;
  v_win_start date;
  v_win_end   date;
  v_page      int;
  v_pages     int;
  v_status    int;
  v_resp      jsonb;
  v_cnt       int;
  v_total     int := 0;
begin
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'tmb_access_token';
  if v_tok is null then
    raise exception 'tmb_access_token ausente no Vault';
  end if;
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','10000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','45000');

  v_win_start := p_start;
  while v_win_start <= p_end loop
    v_win_end := least(v_win_start + 59, p_end);   -- janela de 60 dias (API limita o range)
    v_page := 1;
    v_pages := 1;
    loop
      select status, content::jsonb into v_status, v_resp
      from extensions.http(('GET',
        'https://api.tmbeducacao.com.br/api/pedidos?pageNumber=' || v_page ||
        '&pageSize=100&data_inicio=' || v_win_start || '&data_final=' || v_win_end,
        array[
          extensions.http_header('Authorization','Bearer ' || v_tok),
          extensions.http_header('Accept','application/json')
        ], null, null)::extensions.http_request);

      exit when v_status <> 200;
      v_pages := greatest(coalesce((v_resp->>'totalPages')::int, 1), 1);

      insert into public.tmb_pedidos_raw (
        pedido_id, data, status_pedido, status_financeiro, produto_id, lancamento,
        cliente, email, valor_total, parcelas, valor_entrada, valor_parcela,
        taxa_administracao, melhor_dia_pagamento, criado_em, data_efetivado, updated_at)
      select
        (it->>'pedido_id')::bigint, it, it->>'status_pedido', it->>'status_financeiro',
        nullif(it->>'produto_id','')::bigint, it->>'lancamento',
        nullif(it->>'cliente',''), nullif(it->>'email',''),
        nullif(it->>'valor_total','')::numeric, nullif(it->>'parcelas','')::int,
        nullif(it->>'valor_entrada','')::numeric, nullif(it->>'valor_parcela','')::numeric,
        nullif(it->>'taxa_administracao','')::numeric, nullif(it->>'melhor_dia_pagamento','')::int,
        nullif(it->>'criado_em','')::timestamptz, nullif(it->>'data_efetivado','')::timestamp,
        now()
      from jsonb_array_elements(v_resp->'data') it
      on conflict (pedido_id) do update set
        data=excluded.data, status_pedido=excluded.status_pedido,
        status_financeiro=excluded.status_financeiro, produto_id=excluded.produto_id,
        lancamento=excluded.lancamento, cliente=excluded.cliente, email=excluded.email,
        valor_total=excluded.valor_total, parcelas=excluded.parcelas,
        valor_entrada=excluded.valor_entrada, valor_parcela=excluded.valor_parcela,
        taxa_administracao=excluded.taxa_administracao,
        melhor_dia_pagamento=excluded.melhor_dia_pagamento,
        criado_em=excluded.criado_em, data_efetivado=excluded.data_efetivado, updated_at=now();

      get diagnostics v_cnt = row_count;
      v_total := v_total + v_cnt;
      exit when v_page >= v_pages;
      v_page := v_page + 1;
    end loop;
    v_win_start := v_win_end + 1;
  end loop;

  return v_total;
end;
$function$;

-- Cron diário (04:45): re-puxa os últimos 18 meses para manter o
-- status_financeiro (adimplência) fresco ao longo da vida das parcelas.
select cron.schedule(
  'sync-tmb-pedidos',
  '45 4 * * *',
  $$select public.sync_tmb_pedidos((current_date - 540), current_date)$$
);
