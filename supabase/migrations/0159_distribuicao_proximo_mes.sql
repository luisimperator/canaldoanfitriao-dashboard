-- Prévia da distribuição do mês que vem (Fernando, 28/11: "Não tem como
-- adicionar o botão já pro próximo mês? Pra prever janeiro já contando a
-- distribuição do próximo mês e a saída do meta e tal").
--
-- A conta é a mesma da distribuição do mês (politica_distribuicao): o caixa
-- livre é o menor saldo projetado entre a data e o fim do horizonte, menos o
-- colchão. O que muda é o que ainda não está na provisão e precisa entrar:
--   • a distribuição do mês corrente, como saída no dia dela (se ainda não
--     foi paga) — e a fatia dela que vai pro cofre, no cofre;
--   • as faturas da Meta dos ciclos que ainda não têm linha na provisão,
--     pelo gasto real do ciclo + o ritmo dos últimos 7 dias, com o imposto
--     das últimas faturas, vencendo no dia 1º do segundo mês seguinte (a
--     mesma conta de provisao_meta_atualizar);
--   • o Simples dos meses que ainda não têm linha, pelo faturamento dos
--     últimos 60 dias (a mesma conta de prever_saidas_recorrentes).
--
-- politica_distribuicao(p_data) vira um atalho de
-- politica_distribuicao_com(p_data, '[]', 0): a distribuição do mês não muda.

create or replace function public.politica_distribuicao_com(
  p_data date,
  p_saidas_extras jsonb default '[]'::jsonb,
  p_cofre_extra numeric default 0
)
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
  -- só as que ainda não saíram do banco, inclusive as vencidas; mais as
  -- saídas que a prévia do mês que vem acrescenta
  saidas_cad as (
    select (s->>'data')::date as dia, (s->>'valor')::numeric as valor
    from prov, jsonb_array_elements(j->'saidas_programadas') s
    union all
    select (e->>'dia')::date, (e->>'valor')::numeric
    from jsonb_array_elements(coalesce(p_saidas_extras, '[]'::jsonb)) e
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
    select (select reserva_inicial from cfg) + coalesce(sum(valor), 0) + coalesce(p_cofre_extra, 0) as acumulada
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

-- A distribuição do mês continua exatamente a mesma conta.
create or replace function public.politica_distribuicao(p_data date default current_date)
returns jsonb
language sql
stable security definer
set search_path = public
as $function$
  select public.politica_distribuicao_com(p_data, '[]'::jsonb, 0);
$function$;

create or replace function public.distribuicao_proxima()
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_atual jsonb := public.distribuicao_status();
  v_data_atual date := (v_atual->>'data_distribuicao')::date;
  v_valor_atual numeric := coalesce((v_atual->>'valor')::numeric, 0);
  v_pago_atual numeric := coalesce((v_atual->'realizado'->>'total')::numeric, 0);
  v_data date;
  v_fim date;
  v_extras jsonb := '[]'::jsonb;
  v_cofre_extra numeric := 0;
  v_fator numeric;
  v_ritmo numeric;
  v_fat60 numeric;
  v_aliquota numeric;
  v_passo numeric;
  v_valor numeric;
  v_pol jsonb;
  v_bruto numeric;
  v_vivo numeric;
  m date;
  v_gasto numeric;
  v_dias int;
begin
  v_data := public.distribuicao_data(v_data_atual + 1);
  select (date_trunc('month', v_data) + (horizonte_meses || ' months')::interval - interval '1 day')::date,
         aliquota_simples, arredondamento_distribuicao
    into v_fim, v_aliquota, v_passo
  from politica_caixa where id = 1;

  -- 1. A distribuição do mês corrente sai no dia dela (se ainda não saiu) e a
  --    fatia do cofre dela entra no cofre (se o mês ainda não tem linha).
  if v_pago_atual <= 0 and v_valor_atual > 0 then
    v_extras := v_extras || jsonb_build_object(
      'dia', greatest(v_data_atual, v_hoje), 'valor', v_valor_atual, 'tipo', 'distribuicao',
      'descricao', 'Distribuição de ' || to_char(v_data_atual, 'DD/MM')
                   || case when coalesce((v_atual->>'fechado')::boolean, false) then ' (cravada)' else ' (prévia)' end);
  end if;
  if not exists (select 1 from reserva_mensal where mes = date_trunc('month', v_data_atual)::date) then
    v_cofre_extra := coalesce((v_atual->'politica'->>'vai_pro_cofre')::numeric, 0);
  end if;

  -- 2. Faturas da Meta que ainda não estão na provisão (ciclo m vence no dia
  --    1º de m + 2 meses). Imposto e ritmo como em provisao_meta_atualizar().
  select avg(f.valor / nullif(g.gasto, 0)) into v_fator
  from (select ciclo, sum(valor) valor from meta_faturas
        where coalesce(tipo, 'Invoice') = 'Invoice' group by 1 order by 1 desc limit 3) f
  join (select mes, sum(gasto) gasto from meta_gasto_mensal group by 1) g on g.mes = f.ciclo
  where g.gasto > 0;
  v_fator := coalesce(v_fator, 1 + (select imposto_meta from politica_caixa where id = 1), 1);
  select coalesce(sum(amount), 0) / 7.0 into v_ritmo
  from ad_spend where platform = 'meta_ads' and date >= v_hoje - 7 and date < v_hoje;

  for m in
    select g::date from generate_series(date_trunc('month', v_hoje), date_trunc('month', v_fim) - interval '2 months', interval '1 month') g
  loop
    continue when (m + interval '2 months')::date > v_fim;
    continue when exists (
      select 1 from provisao_saidas where descricao like 'Fatura Meta Ads — gasto de ' || to_char(m, 'MM/YYYY') || '%');
    continue when exists (
      select 1 from meta_faturas where ciclo = m and coalesce(tipo, 'Invoice') = 'Invoice');
    select coalesce(sum(gasto), 0) into v_gasto from meta_gasto_mensal where mes = m;
    v_dias := greatest(0, ((m + interval '1 month')::date - greatest(m, v_hoje)));
    v_valor := round((v_gasto + v_ritmo * v_dias) * v_fator, 2);
    if v_valor > 0 then
      v_extras := v_extras || jsonb_build_object(
        'dia', (m + interval '2 months')::date, 'valor', v_valor, 'tipo', 'meta',
        'descricao', 'Fatura Meta Ads — gasto de ' || to_char(m, 'MM/YYYY') || ' (estimada pelo ritmo de 7 dias)');
    end if;
  end loop;

  -- 3. Simples dos meses que ainda não têm linha (vence dia 20, competência
  --    do mês anterior), pelo faturamento dos últimos 60 dias.
  select coalesce(sum((data->'total'->>'value')::numeric), 0) / 2.0 into v_fat60
  from eduzz_sales_raw
  where status = 'paid'
    and ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date >= v_hoje - 60
    and ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date < v_hoje;

  for m in
    select g::date from generate_series(date_trunc('month', v_hoje), date_trunc('month', v_fim), interval '1 month') g
  loop
    continue when (m + 19) < v_hoje or (m + 19) > v_fim;
    continue when exists (
      select 1 from provisao_saidas where date_trunc('month', data)::date = m and descricao ~* '(simples|darf)');
    v_valor := round(v_fat60 * coalesce(v_aliquota, 0), 2);
    if v_valor > 0 then
      v_extras := v_extras || jsonb_build_object(
        'dia', m + 19, 'valor', v_valor, 'tipo', 'simples',
        'descricao', 'Simples Nacional — competência ' || to_char((m - interval '1 month')::date, 'MM/YYYY')
                     || ' (estimado pelo faturamento de 60 dias)');
    end if;
  end loop;

  v_pol := public.politica_distribuicao_com(v_data, v_extras, v_cofre_extra);
  v_bruto := round(coalesce((v_pol->>'a_distribuir')::numeric, 0), 2);
  v_vivo := case when coalesce(v_passo, 0) > 0 then floor(v_bruto / v_passo) * v_passo else v_bruto end;

  return jsonb_build_object(
    'hoje', v_hoje,
    'competencia', date_trunc('month', v_data)::date,
    'data_distribuicao', v_data,
    'data_fechamento', public.dia_util(v_data - 1, -1),
    'valor', v_vivo,
    'valor_bruto', v_bruto,
    'arredondamento', v_passo,
    'sobra_arredondamento', round(v_bruto - v_vivo, 2),
    'socios', (
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nome', s.nome, 'destino', s.destino,
        'percentual', s.percentual,
        'valor', round(v_vivo * s.percentual, 2)
      ) order by s.ordem)
      from distribuicao_socios s
    ),
    'extras', v_extras,
    'cofre_extra', round(v_cofre_extra, 2),
    'politica', v_pol
  );
end;
$function$;

revoke all on function public.politica_distribuicao_com(date, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.politica_distribuicao_com(date, jsonb, numeric) to service_role;
revoke all on function public.distribuicao_proxima() from public, anon, authenticated;
grant execute on function public.distribuicao_proxima() to service_role;
