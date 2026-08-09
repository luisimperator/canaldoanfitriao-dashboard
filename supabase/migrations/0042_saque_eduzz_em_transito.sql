-- Saque da Eduzz em trânsito: o dinheiro parava de existir no painel.
--
-- Quando se pede saque na Eduzz, o extrato dela debita NA HORA (o saldo cai) e
-- o dinheiro só pinga no Inter no dia útil seguinte. Entre as duas pontas ele
-- não estava em lugar nenhum: fora do saldo da Eduzz, fora do saldo do Inter e
-- fora da projeção. O "Disponível agora" ficava subestimado pelo valor inteiro
-- do saque.
--
-- Isso não era só cosmético. Em 07/08 saíram R$ 74.763,93 que chegam segunda,
-- 10/08 — o MESMO dia da retirada dos sócios (R$ 97.000). Sem o saque na conta,
-- a curva acusava "menor caixa: -R$ 6.114" e disparava alarme de disrupção de
-- caixa que não existia: com o dinheiro no lugar certo, o vale vira +R$ 68 mil.
-- Alarme falso em caixa é pior que alarme nenhum, porque ensina a ignorar.
--
-- Como reconhecer: no extrato da Eduzz é lançamento negativo com descrição
-- 'Transferência - Banco: ...' (a tarifa é outra linha, começa com 'Tarifa').
-- Todo saque histórico caiu no Inter com o valor IDÊNTICO em D+1 útil, então a
-- baixa é por valor exato dentro de uma janela de 7 dias — se já entrou, some
-- da lista sozinho e não conta duas vezes.

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
  -- Saque pedido na Eduzz que ainda não pingou no Inter.
  saques_transito as (
    select s.id,
           -s.valor as valor,
           (s.credit_date at time zone 'America/Sao_Paulo')::date as saiu_em,
           -- D+1 útil: sexta cai na segunda (feriado não entra na conta; se
           -- atrasar, o greatest() lá embaixo segura a data em hoje)
           case extract(dow from (s.credit_date at time zone 'America/Sao_Paulo')::date + 1)
             when 0 then (s.credit_date at time zone 'America/Sao_Paulo')::date + 2
             when 6 then (s.credit_date at time zone 'America/Sao_Paulo')::date + 3
             else (s.credit_date at time zone 'America/Sao_Paulo')::date + 1
           end as chega_em
    from eduzz_statement_raw s
    where s.valor < 0
      and s.description ilike 'Transfer%ncia - Banco%'
      and s.credit_date > now() - interval '30 days'
      and not exists (
        select 1 from fin_transactions f
        where f.direction = 'in'
          and f.amount = -s.valor
          and f.transaction_date >= (s.credit_date at time zone 'America/Sao_Paulo')::date
          and f.transaction_date <= (s.credit_date at time zone 'America/Sao_Paulo')::date + 7
      )
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
    'saques_transito', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'valor', round(valor, 2), 'saiu_em', saiu_em,
        'chega_em', greatest(chega_em, current_date)) order by chega_em), '[]'::jsonb)
      from saques_transito),
    'saques_transito_total', (select coalesce(round(sum(valor), 2), 0) from saques_transito),
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
        'id', id, 'descricao', descricao, 'valor', valor, 'data', data, 'prevista', prevista) order by data), '[]'::jsonb)
      from saidas where paga_em is null and data >= current_date),
    'saidas_pagas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'descricao', descricao, 'valor', valor, 'data', data,
        'prevista', prevista, 'paga_em', paga_em) order by paga_em desc), '[]'::jsonb)
      from saidas where paga_em is not null)
  );
$function$;
