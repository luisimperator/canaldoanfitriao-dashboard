-- Base da página de Projeção financeira (/financeiro/projecao):
-- (1) receita Eduzz JÁ CONTRATADA por mês futuro (parcelas pagas com
--     creditDate ainda por liberar) — dinheiro certo, só falta cair;
-- (2) médias mensais de entradas/saídas do banco (meses fechados) pra
--     projetar o resto; (3) caixa e realizado do mês corrente.
create or replace function public.projecao_financeira()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with futuro as (
    select to_char(date_trunc('month', (data->>'creditDate')::timestamptz), 'YYYY-MM') as mes,
      round(sum((data->'netGain'->>'value')::numeric)) as valor
    from eduzz_sales_raw
    where status = 'paid' and (data->>'creditDate') is not null
      and (data->>'creditDate')::timestamptz >= now()
    group by 1
  ),
  historico as (
    select to_char(date_trunc('month', transaction_date), 'YYYY-MM') as mes,
      round(sum(amount) filter (where direction='in')) as entradas,
      round(sum(amount) filter (where direction='out')) as saidas
    from fin_transactions
    where transaction_date >= (date_trunc('month', current_date) - interval '6 months')
      and transaction_date < date_trunc('month', current_date)
    group by 1
  ),
  caixa as (
    select coalesce(sum(amount) filter (where direction='in'),0)
         - coalesce(sum(amount) filter (where direction='out'),0) as saldo
    from fin_transactions
  ),
  mes_atual as (
    select round(coalesce(sum(amount) filter (where direction='in'),0)) as entradas,
      round(coalesce(sum(amount) filter (where direction='out'),0)) as saidas
    from fin_transactions
    where transaction_date >= date_trunc('month', current_date)
  )
  select jsonb_build_object(
    'hoje', current_date,
    'caixa', (select saldo from caixa),
    'mes_atual', (select jsonb_build_object('entradas', entradas, 'saidas', saidas) from mes_atual),
    'eduzz_futuro', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'valor', valor) order by mes), '[]'::jsonb) from futuro),
    'historico', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'entradas', entradas, 'saidas', saidas) order by mes), '[]'::jsonb) from historico)
  );
$$;
