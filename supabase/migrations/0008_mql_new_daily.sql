-- MQL NOVOS por dia, pela data REAL da 1a atribuição a vendedor (lead_events),
-- não pela data de criação do lead — lead antigo que esquenta hoje é MQL de
-- hoje. Base do card "Fluxo de MQL" em /vendas (janelas 7/30/90 dias), que
-- responde "tem MQL suficiente pra contratar mais vendedor?".
-- Limitação honesta: o histórico começa quando o webhook do Unnichat entrou no
-- ar; janelas maiores que o lastro reportam só o período coberto.

create or replace function public.mql_new_daily(p_days int default 90)
returns table(day date, mql bigint)
language sql stable security definer
set search_path = public
as $$
  with first_attr as (
    select le.unnichat_id, min(le.event_at)::date as attr_date
    from lead_events le
    where le.seller is not null and le.seller <> ''
    group by le.unnichat_id
  )
  select fa.attr_date as day, count(*)::bigint as mql
  from first_attr fa
  join leads l on l.unnichat_id = fa.unnichat_id
  where l.seller_id is not null
    and fa.attr_date > current_date - p_days
  group by 1
  order by 1;
$$;
