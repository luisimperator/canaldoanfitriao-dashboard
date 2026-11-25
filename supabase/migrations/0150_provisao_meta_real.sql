-- Provisão de caixa com a fatura real da Meta + alerta de importação parada
-- (Fernando, 25/11: "tá. corrige").
--
-- O que estava errado: a previsão da fatura da Meta nascia no dia 1º pelo
-- ritmo dos 60 dias anteriores (prever_saidas_recorrentes) e nunca mais era
-- refeita. Outubro gastou 2,5x o ritmo (previsto R$ 31.316, fatura real
-- R$ 78.212,12) e, com o token da Meta vencido de setembro a novembro, o gasto
-- nem estava sendo importado (a previsão de novembro saiu de R$ 44 mil de
-- gasto registrado, contra uns R$ 118 mil reais).
--
-- Agora:
--   1. provisao_meta_atualizar() mantém a linha de cada ciclo na provisão a
--      partir da Meta (migração 0149): com fatura emitida e em aberto, o
--      valor e o vencimento da fatura; sem fatura ainda, o gasto real do
--      ciclo (+ o ritmo dos últimos 7 dias até o fim do mês, no ciclo aberto)
--      com o imposto das últimas faturas, vencendo no dia 1º do segundo mês
--      seguinte (Net 30). Fatura paga não é tocada. Roda a cada 3 h, logo
--      depois da leitura das faturas.
--   2. prever_saidas_recorrentes() não cria mais a previsão da Meta (só a do
--      Simples, como antes).
--   3. alertas_integracoes() aponta quando a importação da Meta (gasto,
--      faturas) ou do custo do WhatsApp para de rodar; a rota
--      /api/sync/alertas manda um aviso no celular (push do painel) e as
--      telas de custo mostram o alerta.

-- ── 1. Previsão da fatura da Meta pela Meta ────────────────────────────────

create or replace function public.provisao_meta_atualizar()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes_atual date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_fator numeric;
  v_ritmo numeric;
  v_dias_rest int;
  r record;
  v_valor numeric;
  v_data date;
  v_desc text;
  v_id provisao_saidas.id%type;
  v_feitos jsonb := '[]'::jsonb;
begin
  -- Imposto que a Meta cobra em cima do gasto: média das 3 últimas faturas.
  select avg(f.valor / nullif(g.gasto, 0)) into v_fator
  from (select ciclo, sum(valor) valor from meta_faturas
        where coalesce(tipo, 'Invoice') = 'Invoice' group by 1 order by 1 desc limit 3) f
  join (select mes, sum(gasto) gasto from meta_gasto_mensal group by 1) g on g.mes = f.ciclo
  where g.gasto > 0;
  v_fator := coalesce(v_fator, 1 + (select imposto_meta from politica_caixa where id = 1), 1);

  -- Ritmo dos últimos 7 dias completos.
  select coalesce(sum(amount), 0) / 7.0 into v_ritmo
  from ad_spend where platform = 'meta_ads' and date >= v_hoje - 7 and date < v_hoje;
  v_dias_rest := ((v_mes_atual + interval '1 month')::date - v_hoje);

  for r in
    select m.mes,
           (select sum(f.valor) from meta_faturas f where f.ciclo = m.mes and coalesce(f.tipo, 'Invoice') = 'Invoice') fatura,
           (select sum(f.em_aberto) from meta_faturas f where f.ciclo = m.mes and coalesce(f.tipo, 'Invoice') = 'Invoice') aberto,
           (select max(f.vence_em) from meta_faturas f where f.ciclo = m.mes and coalesce(f.tipo, 'Invoice') = 'Invoice') vence,
           (select string_agg(f.numero, ', ' order by f.numero) from meta_faturas f where f.ciclo = m.mes and coalesce(f.tipo, 'Invoice') = 'Invoice') numeros,
           (select sum(g.gasto) from meta_gasto_mensal g where g.mes = m.mes) gasto
    from generate_series(v_mes_atual - interval '2 months', v_mes_atual, interval '1 month') m0(mes_ts),
         lateral (select m0.mes_ts::date mes) m
  loop
    if r.fatura is not null then
      -- Fatura paga: a provisão já casa (ou vai casar) com o extrato; não mexe.
      if coalesce(r.aberto, 0) <= 0 then
        continue;
      end if;
      v_valor := r.fatura;
      v_data := r.vence;
      v_desc := 'Fatura Meta Ads — gasto de ' || to_char(r.mes, 'MM/YYYY') || ' (fatura ' || r.numeros || ' da Meta)';
    else
      -- Sem fatura: só o ciclo aberto e o anterior (até a Meta emitir).
      if r.mes < (v_mes_atual - interval '1 month')::date then
        continue;
      end if;
      v_valor := round((coalesce(r.gasto, 0)
                        + case when r.mes = v_mes_atual then v_ritmo * v_dias_rest else 0 end) * v_fator, 2);
      v_data := (r.mes + interval '2 months')::date;
      v_desc := 'Fatura Meta Ads — gasto de ' || to_char(r.mes, 'MM/YYYY') || ' (previsão: gasto real até '
                || to_char(v_hoje, 'DD/MM')
                || case when r.mes = v_mes_atual then ' + ritmo de 7 dias até o fim do mês' else '' end
                || ', com impostos)';
    end if;
    if coalesce(v_valor, 0) <= 0 then
      continue;
    end if;

    select id into v_id from provisao_saidas
    where descricao like 'Fatura Meta Ads — gasto de ' || to_char(r.mes, 'MM/YYYY') || '%'
    order by created_at limit 1;
    if v_id is null then
      insert into provisao_saidas (descricao, valor, data, prevista, match_texto)
      values (v_desc, v_valor, v_data, true, 'facebook');
    else
      update provisao_saidas
         set descricao = v_desc, valor = v_valor, data = v_data
       where id = v_id
         and (valor is distinct from v_valor or data is distinct from v_data or descricao is distinct from v_desc);
    end if;
    v_feitos := v_feitos || jsonb_build_object('ciclo', r.mes, 'valor', v_valor, 'vence', v_data);
  end loop;

  return jsonb_build_object('ok', true, 'fator', round(v_fator, 4), 'ritmo_dia', round(v_ritmo, 2), 'ciclos', v_feitos);
end;
$$;

revoke all on function public.provisao_meta_atualizar() from public, anon, authenticated;

select cron.unschedule('provisao-meta') where exists (select 1 from cron.job where jobname = 'provisao-meta');
select cron.schedule('provisao-meta', '47 */3 * * *', $$select public.provisao_meta_atualizar()$$);

-- ── 2. A previsão mensal deixa de chutar a fatura da Meta ──────────────────

create or replace function public.prever_saidas_recorrentes(p_mes date DEFAULT ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon'::interval))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mes_gasto date := (p_mes - interval '1 month')::date;
  v_fechado boolean := (p_mes - interval '1 month')::date < date_trunc('month', current_date)::date;
  v_aliquota numeric;
  v_fat numeric; v_simples numeric;
  v_origem text; v_criou jsonb := '[]'::jsonb;
begin
  -- A fatura da Meta saiu daqui em 25/11 (migração 0150): quem cuida dela é
  -- provisao_meta_atualizar(), com a fatura e o gasto reais da Meta.
  select aliquota_simples into v_aliquota from politica_caixa where id = 1;
  v_origem := case when v_fechado then 'competência fechada' else 'ritmo de 60 dias' end;

  if v_fechado then
    select coalesce(sum((data->'total'->>'value')::numeric), 0) into v_fat
      from eduzz_sales_raw
     where status = 'paid'
       and ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date >= v_mes_gasto
       and ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date < p_mes;
  else
    select coalesce(sum((data->'total'->>'value')::numeric), 0) / 2.0 into v_fat
      from eduzz_sales_raw
     where status = 'paid'
       and ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date >= current_date - 60
       and ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date < current_date;
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

-- ── 3. Alerta de importação parada ─────────────────────────────────────────
-- Cada importação roda a cada 3 h: mais de 9 h sem uma leitura boa (três
-- rodadas seguidas) vira alerta, com o último erro.

create table if not exists public.integracao_alertas (
  chave text primary key,
  enviado_em timestamptz not null default now(),
  detalhe text
);
alter table public.integracao_alertas enable row level security;
revoke all on public.integracao_alertas from anon, authenticated;

create or replace function public.alertas_integracoes()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'cron'
as $$
  with meta_ads as (
    select max(d.end_time) filter (where d.status = 'succeeded') ok_em,
           (select left(d2.return_message, 200) from cron.job_run_details d2 join cron.job j2 on j2.jobid = d2.jobid
            where j2.jobname = 'sync-meta-ads' and d2.status <> 'succeeded' order by d2.start_time desc limit 1) erro
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'sync-meta-ads' and d.start_time > now() - interval '30 days'
  ),
  logs as (
    select source,
           max(created_at) filter (where note = 'ok') ok_em,
           (array_agg(left(coalesce(body->'erros'->>0, note), 200) order by created_at desc) filter (where note <> 'ok'))[1] erro
    from webhook_log
    where source in ('meta_faturas', 'whatsapp_custos') and created_at > now() - interval '30 days'
    group by 1
  ),
  itens as (
    select 'meta_anuncios' chave, 'Importação do gasto da Meta parada' titulo, ok_em, erro from meta_ads
    union all
    select 'meta_faturas', 'Leitura das faturas da Meta parada', ok_em, erro from logs where source = 'meta_faturas'
    union all
    select 'whatsapp_custos', 'Leitura do custo do WhatsApp parada', ok_em, erro from logs where source = 'whatsapp_custos'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'chave', chave,
           'titulo', titulo,
           'ok_em', ok_em,
           'horas', round(extract(epoch from now() - coalesce(ok_em, now() - interval '30 days')) / 3600),
           'erro', erro,
           'token', coalesce(erro ilike '%access token%' or erro ilike '%session has%' or erro ilike '%OAuth%', false)
         ) order by chave), '[]'::jsonb)
  from itens
  where ok_em is null or ok_em < now() - interval '9 hours';
$$;

revoke all on function public.alertas_integracoes() from public, anon, authenticated;
