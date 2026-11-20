-- Distribuição: conta vencida continua até sair do banco, o dia é o de
-- Brasília e a TMB entra no bolo (Fernando, 19/11: "Quero. E não tem como
-- deixar sempre TMB no bolo?").
--
-- O que aconteceu em 19/11: às 21h de Brasília o current_date (UTC) virou
-- 20/11 e o Simples de R$ 20,2 mil que vence em 20/11 saiu da projeção sem ter
-- sido pago (a curva só tirava saída com data > hoje). A prévia da Heavy Drops
-- subiu ~R$ 5,5 mil de mentira; ia cair de volta quando o DAS saísse do banco.
--
-- 1) Saída programada que venceu e não foi achada no extrato continua
--    descontada (até 30 dias depois do vencimento), em vez de sumir.
-- 2) A baixa automática fica mais esperta, senão o item 1 contaria dobrado:
--    o valor previsto do Simples e da fatura da Meta quase nunca bate com o
--    pago (ex.: Simples previsto R$ 28,2 mil, pago R$ 21,9 mil). Com o
--    beneficiário informado, vale um pagamento dele de 10 dias antes a 15 dias
--    depois do vencimento, de pelo menos 30% do previsto. E o beneficiário
--    aceita alternativas com "|": o DAS aparece no Inter ora como "Receita
--    Federal", ora como "Simples Nacional". Conferido de 07/2026 a 10/2026:
--    todas as 7 previsões dão baixa (antes, só 1).
-- 3) "Hoje" é a data de Brasília na provisão, na política, na média de
--    entrada nova e na despesa de rotina.
-- 4) TMB no bolo: a projeção só via a Eduzz, então o Pix da TMB só contava
--    quando caía no Inter. Agora entra a média diária do que a TMB pagou nos
--    últimos 90 dias (já líquido de taxa e de inadimplência), como a entrada
--    nova da Eduzz, mas sem o desconto de 50%: é dinheiro de parcela já vendida.
--
-- O fechamento automático (fechar-distribuicao, 20h50 BRT) não muda.

-- 2) Baixa automática ------------------------------------------------------
create or replace function public.provisao_saida_paga_em(p_valor numeric, p_data date, p_match text)
returns date
language sql
stable
set search_path = public
as $function$
  select t.transaction_date
  from fin_transactions t
  where t.direction = 'out'
    and (
      p_match is null
      or exists (
        select 1 from unnest(string_to_array(p_match, '|')) a(alt)
        where btrim(a.alt) <> ''
          and (coalesce(t.counterparty,'') || ' ' || coalesce(t.description,''))
              ilike '%' || btrim(a.alt) || '%'
      )
    )
    and (
      -- valor batendo (até 5% ou R$ 500), até 20 dias antes ou depois
      (t.transaction_date between p_data - 20 and p_data + 20
       and abs(t.amount - p_valor) <= least(p_valor * 0.05, 500))
      -- previsão com beneficiário: o valor real quase nunca bate com o
      -- estimado; vale o pagamento dele perto do vencimento
      or (p_match is not null
          and t.transaction_date between p_data - 10 and p_data + 15
          and t.amount >= p_valor * 0.3)
    )
  order by abs(t.amount - p_valor), abs(t.transaction_date - p_data)
  limit 1;
$function$;

-- O DAS do Simples sai como "Receita Federal" ou "Simples Nacional".
update public.provisao_saidas
   set match_texto = 'receita federal|simples nacional'
 where match_texto = 'receita federal';

create or replace function public.prever_saidas_recorrentes(p_mes date DEFAULT ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon'::interval))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mes_gasto date := (p_mes - interval '1 month')::date;
  v_fim_mes date := (p_mes + interval '1 month' - interval '1 day')::date;
  v_fechado boolean := (p_mes - interval '1 month')::date < date_trunc('month', current_date)::date;
  v_imposto_meta numeric; v_aliquota numeric;
  v_ads numeric; v_fat numeric; v_meta numeric; v_simples numeric;
  v_origem text; v_criou jsonb := '[]'::jsonb;
begin
  select imposto_meta, aliquota_simples into v_imposto_meta, v_aliquota
    from politica_caixa where id = 1;
  v_origem := case when v_fechado then 'competência fechada' else 'ritmo de 60 dias' end;

  if v_fechado then
    select coalesce(sum(amount), 0) into v_ads
      from ad_spend where date >= v_mes_gasto and date < p_mes;
    select coalesce(sum((data->'total'->>'value')::numeric), 0) into v_fat
      from eduzz_sales_raw
     where status = 'paid'
       and ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date >= v_mes_gasto
       and ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date < p_mes;
  else
    select coalesce(sum(amount), 0) / 2.0 into v_ads
      from ad_spend where date >= current_date - 60 and date < current_date;
    select coalesce(sum((data->'total'->>'value')::numeric), 0) / 2.0 into v_fat
      from eduzz_sales_raw
     where status = 'paid'
       and ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date >= current_date - 60
       and ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date < current_date;
  end if;

  if not exists (
    select 1 from provisao_saidas
     where date_trunc('month', data)::date = p_mes and descricao ~* '(meta ads|facebook)'
  ) then
    v_meta := round(v_ads * (1 + v_imposto_meta), 2);
    if v_meta > 0 then
      insert into provisao_saidas (descricao, valor, data, prevista, match_texto)
      values ('Fatura Meta Ads — gasto de ' || to_char(v_mes_gasto, 'MM/YYYY')
              || ' (' || v_origem || ')', v_meta, v_fim_mes, true, 'facebook');
      v_criou := v_criou || jsonb_build_object('tipo','meta','valor',v_meta,'data',v_fim_mes);
    end if;
  end if;

  if not exists (
    select 1 from provisao_saidas
     where date_trunc('month', data)::date = p_mes and descricao ~* '(simples|darf)'
  ) then
    v_simples := round(v_fat * v_aliquota, 2);
    if v_simples > 0 then
      insert into provisao_saidas (descricao, valor, data, prevista, match_texto)
      values ('Simples Nacional — competência ' || to_char(v_mes_gasto, 'MM/YYYY')
              || ' (' || v_origem || ')', v_simples, (p_mes + interval '19 days')::date, true,
              'receita federal|simples nacional');
      v_criou := v_criou || jsonb_build_object('tipo','simples','valor',v_simples,'data',(p_mes + interval '19 days')::date);
    end if;
  end if;

  return jsonb_build_object('mes', p_mes, 'origem', v_origem, 'criadas', v_criou);
end;
$function$;

-- 3) Rotina e entrada nova no dia de Brasília -------------------------------
create or replace function public.entrada_liquida_diaria()
returns numeric
language sql
stable
set search_path = public
as $function$
  select coalesce(sum((data->'netGain'->>'value')::numeric), 0) / 60.0
  from eduzz_sales_raw
  where status = 'paid'
    and ((data->>'creditDate')::timestamptz at time zone 'America/Sao_Paulo')::date
        between (now() at time zone 'America/Sao_Paulo')::date - 60
            and (now() at time zone 'America/Sao_Paulo')::date - 1;
$function$;

create or replace function public.despesa_rotina_mensal()
returns numeric
language sql
stable
set search_path = public
as $function$
  select coalesce(percentile_cont(0.5) within group (order by total), 0)
  from (
    select date_trunc('month', transaction_date) as m, sum(amount) as total
    from fin_transactions
    where direction = 'out'
      and transaction_date >= date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '3 months'
      and transaction_date < date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)
      and not exists (
        select 1 from rotina_excecoes e
        where (coalesce(counterparty,'') || ' ' || coalesce(description,'')) ~* e.padrao
      )
    group by 1
  ) t;
$function$;

-- 1) + 3) Provisão: vencida e não paga continua; dia de Brasília -----------
create or replace function public.provisao_caixa()
returns jsonb
language sql
stable security definer
set search_path = public
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
    -- o que libera hoje já está no saldo do extrato (a Eduzz libera o dia inteiro)
    where status='paid'
      and ((data->>'creditDate')::timestamptz at time zone 'America/Sao_Paulo')::date
          > (now() at time zone 'America/Sao_Paulo')::date
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
    -- corte pelo dia, não pela hora: é o "disponível para transferência" da Eduzz
    where (credit_date at time zone 'America/Sao_Paulo')::date
          <= (now() at time zone 'America/Sao_Paulo')::date
  ),
  saques_transito as (
    select s.id,
           -s.valor as valor,
           (s.credit_date at time zone 'America/Sao_Paulo')::date as saiu_em,
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
    where s.data >= (now() at time zone 'America/Sao_Paulo')::date - 30
  )
  select jsonb_build_object(
    'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    'saldo_inter', (select round(saldo::numeric, 2) from saldo_inter),
    'saldo_eduzz_extrato', (select case when saldo is null then null else
      jsonb_build_object('valor', saldo, 'atualizado_em', sync_em) end from extrato),
    'saldo_eduzz_ancora', (select jsonb_build_object('valor', valor, 'informado_em', updated_at) from ancora),
    'liberado_desde_ancora', (
      select coalesce(round(sum((data->'netGain'->>'value')::numeric)), 0)
      from eduzz_sales_raw, ancora
      where status='paid'
        and (data->>'creditDate')::timestamptz > ancora.updated_at
        and ((data->>'creditDate')::timestamptz at time zone 'America/Sao_Paulo')::date
            <= (now() at time zone 'America/Sao_Paulo')::date
    ),
    'saques_transito', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'valor', round(valor, 2), 'saiu_em', saiu_em,
        'chega_em', greatest(chega_em, (now() at time zone 'America/Sao_Paulo')::date)) order by chega_em), '[]'::jsonb)
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
    -- inclui as vencidas que ainda não foram achadas no extrato: o dinheiro
    -- ainda está na conta, então a saída continua valendo
    'saidas_programadas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'descricao', descricao, 'valor', valor, 'data', data, 'prevista', prevista) order by data), '[]'::jsonb)
      from saidas where paga_em is null),
    'saidas_pagas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'descricao', descricao, 'valor', valor, 'data', data,
        'prevista', prevista, 'paga_em', paga_em) order by paga_em desc), '[]'::jsonb)
      from saidas where paga_em is not null)
  );
$function$;

-- 1) + 3) + 4) Política ----------------------------------------------------
create or replace function public.politica_distribuicao(p_data date default current_date)
returns jsonb
language sql
stable security definer
set search_path = public
as $function$
  with cfg as (select * from politica_caixa where id = 1),
  h as (select (now() at time zone 'America/Sao_Paulo')::date as d0),
  horizonte as (
    select (date_trunc('month', p_data) + ((select horizonte_meses from cfg) || ' months')::interval
            - interval '1 day')::date as fim
  ),
  prov as (select provisao_caixa() as j),
  caixa as (
    select (j->>'saldo_inter')::numeric
         + coalesce((j->'saldo_eduzz_extrato'->>'valor')::numeric, 0)
         -- dinheiro nosso que saiu da Eduzz e ainda não pingou no Inter
         + coalesce((j->>'saques_transito_total')::numeric, 0)
         -- saldo parado no Asaas; retrato velho não vale (viraria contagem
         -- dupla com o Inter depois que a raspagem cai lá)
         + coalesce((select s.saldo from asaas_saldo s
                     where s.id = 1 and s.atualizado_em > now() - interval '3 hours'), 0) as hoje
    from prov
  ),
  entradas as (
    select (d->>'dia')::date as dia, (d->>'valor')::numeric as valor
    from prov, jsonb_array_elements(j->'pago_por_dia') d
    union all
    select (d->>'dia')::date, (d->>'valor')::numeric
    from prov, jsonb_array_elements(j->'a_vencer_por_dia') d
  ),
  -- só as que ainda não saíram do banco, inclusive as vencidas
  saidas_cad as (
    select (s->>'data')::date as dia, (s->>'valor')::numeric as valor
    from prov, jsonb_array_elements(j->'saidas_programadas') s
  ),
  rotina as (select despesa_rotina_mensal() / 30.0 as por_dia),
  nova as (select entrada_liquida_diaria() * (select fator_receita_nova from cfg) as por_dia),
  -- TMB: média do que caiu no Inter nos últimos 90 dias (parcelas já
  -- vendidas, líquido de taxa e inadimplência), sem o desconto da receita nova
  tmb as (
    select coalesce(sum(t.amount), 0) / 90.0 as por_dia
    from fin_transactions t, h
    where t.direction = 'in'
      and (coalesce(t.counterparty,'') || ' ' || coalesce(t.description,'')) ~* '\mtmb\M'
      and t.transaction_date between h.d0 - 90 and h.d0 - 1
  ),
  dias as (select generate_series((select d0 from h), (select fim from horizonte), interval '1 day')::date as dia),
  curva as (
    select d.dia,
      (select hoje from caixa)
      + coalesce((select sum(valor) from entradas e where e.dia > (select d0 from h) and e.dia <= d.dia), 0)
      + ((select por_dia from nova) + (select por_dia from tmb)) * (d.dia - (select d0 from h))
      - coalesce((select sum(valor) from saidas_cad s where s.dia <= d.dia), 0)
      - (select por_dia from rotina) * (d.dia - (select d0 from h)) as saldo
    from dias d
  ),
  vale as (
    select min(saldo) as menor, (array_agg(dia order by saldo))[1] as dia_menor
    from curva where dia >= p_data
  ),
  caixa_na_data as (select saldo from curva where dia = p_data),
  reserva_anterior as (
    select (select reserva_inicial from cfg) + coalesce(sum(valor), 0) as acumulada
    from reserva_mensal where mes < date_trunc('month', p_data)::date
  ),
  colchao as (
    select greatest((select acumulada from reserva_anterior), (select piso_operacional from cfg)) as exigido
  ),
  bolo as (
    select greatest(round((select menor from vale) - (select exigido from colchao), 2), 0) as total
  ),
  fatias as (
    select
      least(
        round((select total from bolo) * (select percentual_reserva_distribuicao from cfg), 2),
        greatest(round(meta_reserva() - (select acumulada from reserva_anterior), 2), 0)
      ) as para_cofre
  )
  select jsonb_build_object(
    'hoje', (select d0 from h),
    'data_distribuicao', p_data,
    'horizonte', (select fim from horizonte),
    'caixa_hoje', round((select hoje from caixa), 2),
    'caixa_na_data', round((select saldo from caixa_na_data), 2),
    'menor_caixa_do_periodo', round((select menor from vale), 2),
    'dia_do_vale', (select dia_menor from vale),
    'despesa_rotina_mes', round(despesa_rotina_mensal(), 2),
    'despesa_total_mes', round(despesa_total_mensal(), 2),
    'entrada_nova_por_dia', round((select por_dia from nova), 2),
    'entrada_tmb_por_dia', round((select por_dia from tmb), 2),
    'piso_operacional', (select piso_operacional from cfg),
    'cofre_antes', round((select acumulada from reserva_anterior), 2),
    'colchao_exigido', round((select exigido from colchao), 2),
    'percentual_reserva', (select percentual_reserva_distribuicao from cfg),
    'disponivel_total', (select total from bolo),
    'vai_pro_cofre', (select para_cofre from fatias),
    'a_distribuir', round((select total from bolo) - (select para_cofre from fatias), 2),
    'cofre_depois', round((select acumulada from reserva_anterior) + (select para_cofre from fatias), 2),
    'meta_valor', round(meta_reserva(), 2),
    'progresso_meta', case when meta_reserva() > 0 then round(
      100 * ((select acumulada from reserva_anterior) + (select para_cofre from fatias)) / meta_reserva(), 1)
      else null end,
    'saidas_previstas_periodo', (select coalesce(round(sum(valor)), 0) from saidas_cad),
    'saidas_vencidas', (select coalesce(round(sum(valor)), 0) from saidas_cad where dia < (select d0 from h)),
    'entradas_contratadas_periodo', (select coalesce(round(sum(valor)), 0) from entradas where dia > (select d0 from h))
  );
$function$;
