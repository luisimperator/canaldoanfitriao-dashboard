-- A "despesa de rotina" é a mediana das saídas dos últimos 3 meses fechados —
-- e estava engolindo gasto de evento como se fosse recorrente. A Agência OM,
-- por exemplo, eram parcelas do 4º Encontro (R$ 7.594 em abr/mai/jun + ~R$ 30
-- mil em julho): parcelamento encerrado, não volta. Enquanto isso ficasse na
-- conta, o modelo provisionava ~R$ 7,6 mil/mês que não existem mais e devolvia
-- distribuição a menos (rotina R$ 44.861 → R$ 37.267; distribuição de 10/08
-- R$ 102 mil → R$ 104 mil).
--
-- Em vez de regex fixa dentro da função, as exceções viram tabela — assim dá
-- pra corrigir sem migração nova quando outro gasto pontual aparecer.

create table if not exists public.rotina_excecoes (
  padrao text primary key,            -- regex sobre beneficiário + descrição
  motivo text not null,
  criado_em timestamptz not null default now()
);
alter table public.rotina_excecoes enable row level security;

insert into public.rotina_excecoes (padrao, motivo) values
  ('romulo',         'distribuição de sócio — não é despesa'),
  ('luis fernando',  'distribuição de sócio — não é despesa'),
  ('facebook',       'ads — entra na projeção pela fatura real, não na rotina'),
  ('receita federal','imposto — tratado à parte'),
  ('simples',        'imposto — tratado à parte'),
  ('agencia om',     'parcelamento do 4º Encontro — encerrado, não recorre')
on conflict (padrao) do nothing;

create or replace function public.despesa_rotina_mensal()
returns numeric language sql stable set search_path to 'public' as $$
  select coalesce(percentile_cont(0.5) within group (order by total), 0)
  from (
    select date_trunc('month', transaction_date) as m, sum(amount) as total
    from fin_transactions
    where direction = 'out'
      and transaction_date >= date_trunc('month', current_date) - interval '3 months'
      and transaction_date < date_trunc('month', current_date)
      and not exists (
        select 1 from rotina_excecoes e
        where (coalesce(counterparty,'') || ' ' || coalesce(description,'')) ~* e.padrao
      )
    group by 1
  ) t;
$$;
