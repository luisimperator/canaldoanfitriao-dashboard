-- Compradores de CURSO do período × temperatura do lead × vendedor.
-- Um comprador por e-mail; temperatura = tag lead-* mais alta do histórico.
-- Base do card "Compradores de curso × temperatura" em /vendas.
create or replace function public.buyer_temp_month(p_start date, p_end date)
returns table(vendedor text, perfil text, compradores bigint)
language sql stable security definer
set search_path = public
as $$
  with vendas as (
    select distinct on (lower(coalesce(s.buyer_email,''))) s.id,
      lower(coalesce(s.buyer_email,'')) as be,
      se.name as vendedor
    from sales s
    left join sellers se on se.id = s.seller_id
    where s.status='paga' and s.sale_date between p_start and p_end
      and (lower(s.product) like '%5 estrelas%' or lower(s.product) like '%gigantes da temporada%')
      and lower(s.product) not similar to '%(encontro|ingresso|grupo|cadeira|pessoa adicional|checklist)%'
  ),
  match as (
    select v.id as sale_id, v.vendedor, l.id as lead_id, l.unnichat_id
    from vendas v
    left join lateral (select id, unnichat_id from leads where lower(email) = v.be limit 1) l on true
  ),
  temp as (
    select m.sale_id, m.vendedor,
      max(case
        when le.tags ~* '(^|, )lead-muito-quente(,|$)' then 5
        when le.tags ~* '(^|, )lead-(a5e|gigantes)(,|$)' then 4
        when le.tags ~* '(^|, )lead-quente(,|$)' then 3
        when le.tags ~* '(^|, )lead-morno(,|$)' then 2
        when le.tags ~* '(^|, )lead-frio(,|$)' then 1
        when le.tags ~* '(^|, )lead-muito-frio(,|$)' then 0
        else null end) as t,
      max((m.lead_id is not null)::int) as tem_lead,
      max((m.unnichat_id is not null)::int) as no_crm
    from match m
    left join lead_events le on le.unnichat_id = m.unnichat_id
    group by m.sale_id, m.vendedor
  )
  select vendedor,
    case
      when t = 5 then 'muito quente'
      when t = 4 then 'quente A5E/Gig'
      when t = 3 then 'quente'
      when t = 2 then 'morno'
      when t = 1 then 'frio'
      when t = 0 then 'muito frio'
      when no_crm = 1 then 'sem temperatura'
      when tem_lead = 1 then 'fora do CRM'
      else 'nem era lead'
    end as perfil,
    count(*)::bigint as compradores
  from temp
  group by 1, 2;
$$;
