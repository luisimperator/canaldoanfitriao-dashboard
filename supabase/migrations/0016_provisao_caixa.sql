-- Provisão de caixa (Eduzz + Inter + saídas previstas).
--
-- A Eduzz libera cada venda paga num prazo que depende do meio de pagamento
-- (creditDate no raw). Não existe endpoint público de saldo na API da Eduzz,
-- então o saldo disponível lá é uma ÂNCORA manual (provisao_ajustes) que o
-- painel corrige sozinho somando o que liberou desde que o valor foi informado.
--
-- provisao_caixa() devolve tudo que a página /financeiro/provisao precisa:
--   saldo Inter (fin_transactions), âncora Eduzz + drift, liberações futuras
--   por dia (pago, com creditDate exato), previsão de a-vencer (não pagos,
--   assumindo pagamento no vencimento + mediana real de prazo por método),
--   saídas recorrentes detectadas no extrato e média mensal de saídas.

create table if not exists provisao_ajustes (
  chave text primary key,
  valor numeric not null,
  updated_at timestamptz not null default now()
);

alter table provisao_ajustes enable row level security;

create or replace function public.provisao_caixa()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with fator as (
    -- líquido/bruto médio das vendas pagas (90d) — usado pra estimar o líquido
    -- de cobranças ainda não pagas (netGain chega 0 antes do pagamento).
    select coalesce(avg((data->'netGain'->>'value')::numeric / nullif((data->'total'->>'value')::numeric,0)), 0.9) as f
    from eduzz_sales_raw
    where status='paid' and (data->>'paidAt')::timestamptz > now() - interval '90 days'
      and (data->'total'->>'value')::numeric > 0
  ),
  lags as (
    -- mediana real (120d) de dias entre pagar e liberar, por meio de pagamento
    select data->>'paymentMethod' as metodo,
      (percentile_cont(0.5) within group (order by
        extract(epoch from ((data->>'creditDate')::timestamptz - (data->>'paidAt')::timestamptz))/86400))::numeric as lag_dias
    from eduzz_sales_raw
    where status='paid' and (data->>'creditDate') is not null and (data->>'paidAt') is not null
      and (data->>'paidAt')::timestamptz > now() - interval '120 days'
    group by 1
  ),
  pago_rows as (
    -- pago pelo cliente, dinheiro ainda preso: creditDate exato no futuro
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
    -- não pagos (janela de 60d): assume pagamento no vencimento e liberação
    -- vencimento + mediana do método (sem mediana: 2 dias)
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
  recorrentes as (
    -- saídas que se repetiram em ≥3 dos últimos 4 meses fechados (≥ R$300)
    select coalesce(nullif(trim(counterparty),''), left(description,40)) as quem,
      count(distinct date_trunc('month', transaction_date)) as meses,
      round((percentile_cont(0.5) within group (order by amount))::numeric) as valor_tipico,
      round((percentile_cont(0.5) within group (order by extract(day from transaction_date)))::numeric)::int as dia_tipico
    from fin_transactions
    where direction='out' and amount >= 300
      and transaction_date >= date_trunc('month', current_date) - interval '4 months'
      and transaction_date < date_trunc('month', current_date)
    group by 1
    having count(distinct date_trunc('month', transaction_date)) >= 3
    order by 3 desc
    limit 12
  ),
  media_saidas as (
    select round(avg(m)) as v from (
      select date_trunc('month', transaction_date), sum(amount) as m
      from fin_transactions
      where direction='out'
        and transaction_date >= date_trunc('month', current_date) - interval '3 months'
        and transaction_date < date_trunc('month', current_date)
      group by 1
    ) t
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
    'saidas_recorrentes', (select coalesce(jsonb_agg(jsonb_build_object(
        'quem', quem, 'valor', valor_tipico, 'dia', dia_tipico, 'meses', meses) order by valor_tipico desc), '[]'::jsonb) from recorrentes),
    'media_saidas_mes', (select v from media_saidas)
  );
$function$;
