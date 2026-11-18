-- Téo: quem comprou a Black do ano passado (Black Friday Histórica 2025) também
-- conta como "já comprou a Black": não há nada a vender pra ele (Fernando, 18/11:
-- "se ele já comprou a Black do ano passado, não temos nada a vender pra ele,
-- mas se ele tá aqui, pergunta como pode ajudar"). Antes a Eduzz só olhava a 2026.
create or replace function public.teo_compra_black(p_emails text[], p_telefone text)
returns table (origem text, quando timestamptz, email text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with tel as (
    select right(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), 8) as t
  ),
  em as (
    select lower(trim(e)) as e from unnest(coalesce(p_emails, '{}'::text[])) as e where e like '%@%'
  ),
  eduzz as (
    -- sale_date (meio-dia em SP) e não created_at: as vendas da Black 2025 foram
    -- importadas depois e o created_at delas é o dia da importação.
    select 'Eduzz'::text as origem,
           coalesce((s.sale_date::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo', s.created_at) as quando,
           lower(s.buyer_email) as email
      from sales s
      left join eduzz_sales_raw r on r.id = s.eduzz_invoice_id
      cross join tel
     where s.status = 'paga'
       and s.product ilike 'Black Friday Histórica%'
       and (
         lower(s.buyer_email) in (select e from em)
         or (length(tel.t) = 8
             and right(regexp_replace(coalesce(r.data -> 'buyer' ->> 'phone', ''), '\D', '', 'g'), 8) = tel.t)
       )
  ),
  tmb as (
    select 'TMB'::text as origem, coalesce(p.criado_em, p.updated_at) as quando, lower(p.email) as email
      from tmb_pedidos_raw p
      cross join tel
     where p.lancamento ilike 'Black Friday Histórica%'
       and p.status_pedido = 'Efetivado'
       and (
         lower(p.email) in (select e from em)
         or (length(tel.t) = 8
             and right(regexp_replace(coalesce(p.data ->> 'telefone', ''), '\D', '', 'g'), 8) = tel.t)
       )
  ),
  tmb_aviso as (
    select 'TMB'::text as origem, v.recebido_em as quando, lower(v.email) as email
      from tmb_eventos v
      cross join tel
     where v.evento = 'vendas'
       and v.produto ilike 'Black Friday Histórica%'
       and v.status = 'Efetivado'
       and (
         lower(v.email) in (select e from em)
         or (length(tel.t) = 8
             and right(regexp_replace(coalesce(v.telefone, v.payload ->> 'telefone_ativo', ''), '\D', '', 'g'), 8) = tel.t)
       )
  )
  select origem, quando, email from (select * from eduzz union all select * from tmb union all select * from tmb_aviso) x
   order by quando desc nulls last
   limit 1;
$$;

revoke all on function public.teo_compra_black(text[], text) from public, anon, authenticated;
grant execute on function public.teo_compra_black(text[], text) to service_role;
