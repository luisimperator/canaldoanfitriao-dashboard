-- Atendimento no dia 0 por CARGA do dia (calmo/médio/pico). Se o d0 só cai em
-- dia de pico, falta gente; se cai no dia calmo, falta processo. Descoberta que
-- motivou: no pico o time atende ~73% no dia 0, no dia calmo só ~31% — ou seja,
-- o gargalo é rotina, não headcount. Base do card em /vendas.

create or replace function public.d0_by_day_load(p_days int default 90)
returns table(bucket text, dias bigint, leads bigint, d0 bigint, nunca bigint)
language sql stable security definer
set search_path = public
as $$
  with conv as (
    select
      (select min((m->>'date')::timestamptz) from jsonb_array_elements(c.messages) m) as arrival,
      (select min((m->>'date')::timestamptz) from jsonb_array_elements(c.messages) m
        where m->>'senderBy'='user' and (m->>'origin') is null) as first_human
    from conversations c
    where c.seller is not null and c.messages is not null
      and regexp_replace(lower(c.seller),'\s+',' ','g') <> 'fernando imperator'
  ),
  lagged as (
    select arrival::date as dia,
      case when first_human is null then null
        else greatest(0,(select count(*) from generate_series(arrival::date, first_human::date, interval '1 day') g
          where extract(isodow from g) between 1 and 5) - 1) end as lag
    from conv
    where arrival >= current_date - p_days
  ),
  por_dia as (
    select dia, count(*) as chegaram,
      count(*) filter (where lag = 0) as d0,
      count(*) filter (where lag is null) as nunca
    from lagged group by dia
  )
  select
    case when chegaram <= 10 then 'calmo'
         when chegaram <= 25 then 'medio'
         else 'pico' end as bucket,
    count(*)::bigint as dias,
    sum(chegaram)::bigint as leads,
    sum(d0)::bigint as d0,
    sum(nunca)::bigint as nunca
  from por_dia
  group by 1
  order by min(chegaram);
$$;
