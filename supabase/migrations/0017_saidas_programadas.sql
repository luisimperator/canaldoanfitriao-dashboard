-- Saídas previstas passam a ser pagamentos AGENDADOS (não mais detecção de
-- recorrência no extrato): a fonte principal são os boletos/pagamentos
-- agendados no Banco Inter (consultados ao vivo pela página) e a tabela
-- provisao_saidas guarda os agendamentos cadastrados na mão (o que o banco
-- não lista, ex.: Pix agendado).
--
-- provisao_caixa() perde saidas_recorrentes/media_saidas_mes e ganha
-- saidas_programadas (as manuais, com data >= hoje).

create table if not exists provisao_saidas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor numeric not null check (valor > 0),
  data date not null,
  created_at timestamptz not null default now()
);

alter table provisao_saidas enable row level security;

create or replace function public.provisao_caixa()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with fator as (
    select coalesce(avg((data->'netGain'->>'value')::numeric / nullif((data->'total'->>'value')::numeric,0)), 0.9) as f
    from eduzz_sales_raw
    where status='paid' and (data->>'paidAt')::timestamptz > now() - interval '90 days'
      and (data->'total'->>'value')::numeric > 0
  ),
  lags as (
    select data->>'paymentMethod' as metodo,
      (percentile_cont(0.5) within group (order by
        extract(epoch from ((data->>'creditDate')::timestamptz - (data->>'paidAt')::timestamptz))/86400))::numeric as lag_dias
    from eduzz_sales_raw
    where status='paid' and (data->>'creditDate') is not null and (data->>'paidAt') is not null
      and (data->>'paidAt')::timestamptz > now() - interval '120 days'
    group by 1
  ),
  pago_rows as (
    select ((data->>'creditDate')::timestamptz at time zone 'America/Sao_Paulo')::date as dia,
      (data->'netGain'->>'value')::numeric as valor,
      coalesce(data->'buyer'->>'name', '—') as nome,
      coalesce(data->'product'->>'name', '—') as produto,
      coalesce(data->>'paymentMethod', '—') as metodo
    from eduzz_sales_raw
    where status='paid' and (data->>'creditDate')::timestamptz > now()
  ),
  pago_futuro as (
    select dia, sum(valor) as valor, count(*) as cobrancas,
      jsonb_agg(jsonb_build_object('nome', nome, 'produto', produto, 'metodo', metodo,
        'valor', round(valor)) order by valor desc) as items
    from pago_rows
    group by 1
  ),
  vencer_rows as (
    select (
        ((data->>'dueDate')::timestamptz at time zone 'America/Sao_Paulo')::date
        + coalesce((select round(l.lag_dias)::int from lags l where l.metodo = data->>'paymentMethod'), 2)
      ) as dia,
      coalesce(nullif((data->'netGain'->>'value')::numeric, 0),
               (data->'total'->>'value')::numeric * (select f from fator)) as valor,
      coalesce(data->'buyer'->>'name', '—') as nome,
      coalesce(data->'product'->>'name', '—') as produto,
      coalesce(data->>'paymentMethod', '—') as metodo
    from eduzz_sales_raw
    where status in ('waitingPayment','open','scheduled')
      and (data->>'dueDate') is not null
      and (data->>'dueDate')::timestamptz >= now() - interval '2 days'
      and (data->>'dueDate')::timestamptz <= now() + interval '60 days'
      and (data->'total'->>'value')::numeric > 0
  ),
  a_vencer as (
    select dia, sum(valor) as valor, count(*) as cobrancas,
      jsonb_agg(jsonb_build_object('nome', nome, 'produto', produto, 'metodo', metodo,
        'valor', round(valor)) order by valor desc) as items
    from vencer_rows
    group by 1
  ),
  saldo_inter as (
    select coalesce(sum(amount) filter (where direction='in'),0)
         - coalesce(sum(amount) filter (where direction='out'),0) as saldo
    from fin_transactions
  ),
  ancora as (
    select valor, updated_at from provisao_ajustes where chave = 'saldo_eduzz'
  )
  select jsonb_build_object(
    'hoje', current_date,
    'saldo_inter', (select round(saldo::numeric, 2) from saldo_inter),
    'saldo_eduzz_ancora', (select jsonb_build_object('valor', valor, 'informado_em', updated_at) from ancora),
    'liberado_desde_ancora', (
      select coalesce(round(sum((data->'netGain'->>'value')::numeric)), 0)
      from eduzz_sales_raw, ancora
      where status='paid'
        and (data->>'creditDate')::timestamptz > ancora.updated_at
        and (data->>'creditDate')::timestamptz <= now()
    ),
    'a_liberar_total', (select coalesce(round(sum(valor)), 0) from pago_futuro),
    'a_liberar_cobrancas', (select coalesce(sum(cobrancas), 0) from pago_futuro),
    'pago_por_dia', (select coalesce(jsonb_agg(jsonb_build_object(
        'dia', dia, 'valor', round(valor), 'cobrancas', cobrancas, 'items', items) order by dia), '[]'::jsonb) from pago_futuro),
    'a_vencer_por_dia', (select coalesce(jsonb_agg(jsonb_build_object(
        'dia', dia, 'valor', round(valor), 'cobrancas', cobrancas, 'items', items) order by dia), '[]'::jsonb) from a_vencer),
    'a_vencer_total', (select coalesce(round(sum(valor)), 0) from a_vencer),
    'a_vencer_cobrancas', (select coalesce(sum(cobrancas), 0) from a_vencer),
    'lags', (select coalesce(jsonb_object_agg(metodo, round(lag_dias, 1)), '{}'::jsonb) from lags),
    'saidas_programadas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'descricao', descricao, 'valor', valor, 'data', data) order by data), '[]'::jsonb)
      from provisao_saidas where data >= current_date)
  );
$function$;
