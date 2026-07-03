-- Conversão REAL de MQL, por coorte: dos contatos que viraram MQL (mql_at),
-- quantos compraram curso DEPOIS de virar MQL (match por lead_id ou e-mail).
-- E das vendas de curso dos últimos 30d, quantas vieram de MQLs. Substitui a
-- razão vendas÷MQL (fluxos independentes), que inflava a conversão: ~87% das
-- vendas de curso vêm de fora do funil de MQL (compra direta / base / e-mail).
create or replace function public.mql_cohort_stats()
returns table(
  mqls_total bigint,
  mqls_compraram bigint,
  vendas_curso_30d bigint,
  vendas_30d_de_mql bigint
)
language sql stable security definer
set search_path = public
as $$
  with curso as (
    select s.sale_date, s.lead_id, lower(coalesce(s.buyer_email,'')) as buyer_email
    from sales s
    where s.status='paga'
      and (lower(s.product) like '%5 estrelas%' or lower(s.product) like '%gigantes da temporada%')
      and lower(s.product) not similar to '%(encontro|ingresso|grupo|cadeira|pessoa adicional|checklist)%'
  ),
  mql as (
    select id, lower(coalesce(email,'')) as email, mql_at
    from leads where mql_at is not null
  )
  select
    (select count(*) from mql),
    (select count(*) from mql m where exists (
      select 1 from curso c
      where (c.lead_id = m.id or (m.email <> '' and c.buyer_email = m.email))
        and c.sale_date >= m.mql_at::date
    )),
    (select count(*) from curso where sale_date > current_date - 30),
    (select count(*) from curso c where c.sale_date > current_date - 30 and exists (
      select 1 from mql m
      where (c.lead_id = m.id or (m.email <> '' and c.buyer_email = m.email))
        and m.mql_at::date <= c.sale_date
    ));
$$;
