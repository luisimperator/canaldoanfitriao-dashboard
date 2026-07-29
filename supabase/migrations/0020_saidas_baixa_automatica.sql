-- Baixa automática das saídas previstas: se o pagamento já apareceu no extrato
-- do Inter, a saída para de ser descontada do saldo projetado.
--
-- Sem isso, uma previsão cadastrada (ex.: "Fatura Meta Ads, vence 31/07") segue
-- pesando na projeção mesmo depois de paga — foi o que aconteceu com o boleto
-- do Facebook de R$ 19.124, pago no dia 29/07 enquanto a previsão continuava
-- lá. Antes a limpeza era manual.
--
-- Conciliação: procura em fin_transactions uma SAÍDA com valor próximo (±5%,
-- teto de R$ 500 de diferença) numa janela de ±20 dias em torno da data
-- prevista — pagamentos do Meta e impostos costumam sair alguns dias antes ou
-- depois do vencimento. Quando match_texto está preenchido, o beneficiário
-- também tem de casar, o que praticamente elimina falso positivo.

alter table public.provisao_saidas
  add column if not exists match_texto text;

comment on column public.provisao_saidas.match_texto is
  'Trecho do nome do beneficiário no extrato (ex.: "facebook") para conciliar a baixa automática. Nulo = casa só por valor e data.';

create or replace function public.provisao_saida_paga_em(
  p_valor numeric, p_data date, p_match text
) returns date
language sql
stable
set search_path to 'public'
as $function$
  select t.transaction_date
  from fin_transactions t
  where t.direction = 'out'
    and t.transaction_date between p_data - 20 and p_data + 20
    and abs(t.amount - p_valor) <= least(p_valor * 0.05, 500)
    and (
      p_match is null
      or (coalesce(t.counterparty,'') || ' ' || coalesce(t.description,'')) ilike '%' || p_match || '%'
    )
  order by abs(t.amount - p_valor), abs(t.transaction_date - p_data)
  limit 1;
$function$;

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
  extrato as (
    select round(sum(valor), 2) as saldo, max(synced_at) as sync_em
    from eduzz_statement_raw
    where credit_date <= now()
  ),
  ancora as (
    select valor, updated_at from provisao_ajustes where chave = 'saldo_eduzz'
  ),
  saidas as (
    select s.id, s.descricao, s.valor, s.data, s.prevista,
      provisao_saida_paga_em(s.valor, s.data, s.match_texto) as paga_em
    from provisao_saidas s
    where s.data >= current_date - 30
  )
  select jsonb_build_object(
    'hoje', current_date,
    'saldo_inter', (select round(saldo::numeric, 2) from saldo_inter),
    'saldo_eduzz_extrato', (select case when saldo is null then null else
      jsonb_build_object('valor', saldo, 'atualizado_em', sync_em) end from extrato),
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
    -- saídas ainda por sair (o que a projeção desconta)
    'saidas_programadas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'descricao', descricao, 'valor', valor, 'data', data, 'prevista', prevista) order by data), '[]'::jsonb)
      from saidas where paga_em is null and data >= current_date),
    -- baixadas pelo extrato: aparecem na lista como quitadas, fora do saldo
    'saidas_pagas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'descricao', descricao, 'valor', valor, 'data', data,
        'prevista', prevista, 'paga_em', paga_em) order by paga_em desc), '[]'::jsonb)
      from saidas where paga_em is not null)
  );
$function$;
