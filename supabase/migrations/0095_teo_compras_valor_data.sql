-- Téo: compras do lead com o valor pago e a data real do pagamento.
-- Regra do Fernando (14/11): quem comprou o Anfitrião 5 Estrelas ou o Gigantes
-- de outubro pra frente faz a Black por R$ 1.997, só se pedir. A renovação do
-- Anfitrião 5 Estrelas (R$ 997) entra com o mesmo nome do curso, então o Téo
-- precisa do valor pra separar compra de renovação. E sales.created_at é a
-- data da importação (as compras antigas foram importadas em 12/06): a data
-- certa é o paidAt da Eduzz, ou sale_date.
drop function if exists public.teo_compras_do_lead(text[], text);

create function public.teo_compras_do_lead(p_emails text[], p_telefone text)
returns table (email text, produto text, quando timestamptz, valor numeric)
language sql
stable
security definer
set search_path = public
as $$
  with tel as (
    select right(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), 8) as t
  ),
  em as (
    select lower(trim(e)) as e from unnest(coalesce(p_emails, '{}'::text[])) as e where e like '%@%'
  ),
  achadas as (
    select lower(s.buyer_email) as email, s.product as produto,
           coalesce((r.data ->> 'paidAt')::timestamptz, s.sale_date::timestamptz, s.created_at) as quando,
           s.amount as valor
      from sales s
      left join eduzz_sales_raw r on r.id = s.eduzz_invoice_id
      cross join tel
     where s.status = 'paga'
       and (
         lower(s.buyer_email) in (select e from em)
         or (length(tel.t) = 8
             and right(regexp_replace(coalesce(r.data -> 'buyer' ->> 'phone', ''), '\D', '', 'g'), 8) = tel.t)
       )
  )
  select email, produto, quando, valor from achadas order by quando desc limit 300;
$$;

revoke all on function public.teo_compras_do_lead(text[], text) from public, anon, authenticated;
grant execute on function public.teo_compras_do_lead(text[], text) to service_role;
