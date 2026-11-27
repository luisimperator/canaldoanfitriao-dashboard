-- Meses pra frente no Tráfego da Meta (Fernando, 27/11: "isso aqui tem que ter
-- os meses pra frente. o dinheiro do caixa em janeiro já tem previsão. é
-- menor mas já tem. e aí vai sendo ajustado conforme for faturado em
-- dezembro. mas tem que dar pra navegar até o futuro. pq já tem faturamentos
-- previstos da TMB, por exemplo").
--
-- painel_caixa_futuro(p_meses): pra cada mês a partir do próximo, o que já se
-- sabe que entra no caixa e o que vence de fatura da Meta:
-- • eduzz_liberar: vendas da Eduzz já pagas cujo dinheiro cai no mês
--   (creditDate), líquido (netGain);
-- • eduzz_agendado: faturas avulsas da Eduzz a vencer no mês (sem assinatura),
--   líquidas pelo fator médio dos últimos 90 dias;
-- • renovacao_potencial / renovacao_esperada: assinaturas ativas (anuais) que
--   renovam no mês; a esperada aplica a taxa de renovação histórica (quem
--   começou há 13–24 meses e pagou a 2ª cobrança) e o fator líquido;
-- • tmb: parcelas dos boletos da TMB em dia (Adimplente) que vencem no mês,
--   no melhor dia de pagamento, menos a taxa de administração;
-- • meta_aberta: faturas da Meta já emitidas e em aberto que vencem no mês.
-- A fatura estimada dos ciclos que ainda não fecharam sai na página, pelo
-- ritmo de gasto dos últimos 7 dias.

create or replace function public.painel_caixa_futuro(p_meses int default 6)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date d),
  meses as (
    select generate_series(
      (date_trunc('month', (select d from hoje)) + interval '1 month')::date,
      (date_trunc('month', (select d from hoje)) + make_interval(months => greatest(p_meses, 1)))::date,
      interval '1 month')::date mes
  ),
  fator as (
    select coalesce(avg((data->'netGain'->>'value')::numeric / nullif((data->'total'->>'value')::numeric, 0)), 0.9) f
    from eduzz_sales_raw
    where status = 'paid' and (data->>'paidAt')::timestamptz > now() - interval '90 days'
      and (data->'total'->>'value')::numeric > 0
  ),
  liberar as (
    select date_trunc('month', ((data->>'creditDate')::timestamptz at time zone 'America/Sao_Paulo'))::date mes,
           sum((data->'netGain'->>'value')::numeric) v, count(*) n
    from eduzz_sales_raw
    where status = 'paid' and (data->>'creditDate')::timestamptz > now()
    group by 1
  ),
  agendado as (
    select date_trunc('month', ((data->>'dueDate')::timestamptz at time zone 'America/Sao_Paulo'))::date mes,
           sum(coalesce(nullif((data->'netGain'->>'value')::numeric, 0), (data->'total'->>'value')::numeric * (select f from fator))) v,
           count(*) n
    from eduzz_sales_raw
    where status in ('waitingPayment', 'open', 'scheduled')
      and (data->>'dueDate')::timestamptz >= now()
      and (data->>'contractId') is null
      and (data->'total'->>'value')::numeric > 0
    group by 1
  ),
  taxa as (
    select coalesce(avg(case when (select count(*) from eduzz_sales_raw s
                                   where s.data->>'contractId' = a.id_assinatura_eduzz::text and s.status = 'paid') >= 2
                             then 1.0 else 0.0 end), 0) t
    from assinaturas_eduzz a
    where a.tipo is distinct from 'venda_unica'
      and a.inicio between (select d from hoje) - interval '24 months' and (select d from hoje) - interval '13 months'
  ),
  renov as (
    select date_trunc('month', a.proximo_vencimento)::date mes, sum(a.valor) bruto, count(*) n
    from assinaturas_eduzz a
    where a.status_normalizado = 'ativa' and a.tipo is distinct from 'venda_unica'
      and a.proximo_vencimento > (select d from hoje)
    group by 1
  ),
  tmb as (
    select date_trunc('month', venc)::date mes, sum(liquido) v, count(*) n
    from (
      select (date_trunc('month', t.data_efetivado) + make_interval(months => k))::date
               + (least(coalesce(nullif(t.melhor_dia_pagamento, 0), 10),
                        extract(day from (date_trunc('month', t.data_efetivado) + make_interval(months => k + 1) - interval '1 day'))::int) - 1) venc,
             t.valor_parcela * (1 - coalesce(t.taxa_administracao, 0) / 100.0) liquido
      from tmb_pedidos_raw t, generate_series(1, coalesce(t.parcelas, 0)) k
      where t.status_pedido = 'Efetivado' and t.status_financeiro = 'Adimplente'
        and t.data_efetivado is not null and t.valor_parcela > 0
    ) x
    where venc > (select d from hoje)
    group by 1
  ),
  meta_aberta as (
    select date_trunc('month', vence_em)::date mes, sum(em_aberto) v
    from meta_faturas
    where coalesce(tipo, 'Invoice') = 'Invoice' and em_aberto > 0 and vence_em > (select d from hoje)
    group by 1
  )
  select jsonb_build_object(
    'fator_liquido', round((select f from fator), 4),
    'taxa_renovacao', round((select t from taxa), 4),
    'meses', (select coalesce(jsonb_agg(jsonb_build_object(
        'mes', m.mes,
        'eduzz_liberar', round(coalesce(l.v, 0), 2), 'eduzz_liberar_n', coalesce(l.n, 0),
        'eduzz_agendado', round(coalesce(a.v, 0), 2), 'eduzz_agendado_n', coalesce(a.n, 0),
        'renovacao_potencial', round(coalesce(r.bruto, 0) * (select f from fator), 2), 'renovacao_n', coalesce(r.n, 0),
        'renovacao_esperada', round(coalesce(r.bruto, 0) * (select f from fator) * (select t from taxa), 2),
        'tmb', round(coalesce(t.v, 0), 2), 'tmb_n', coalesce(t.n, 0),
        'meta_aberta', round(coalesce(ma.v, 0), 2)
      ) order by m.mes), '[]'::jsonb)
      from meses m
      left join liberar l using (mes)
      left join agendado a using (mes)
      left join renov r using (mes)
      left join tmb t using (mes)
      left join meta_aberta ma using (mes))
  );
$$;

revoke all on function public.painel_caixa_futuro(int) from public, anon, authenticated;
grant execute on function public.painel_caixa_futuro(int) to service_role;
