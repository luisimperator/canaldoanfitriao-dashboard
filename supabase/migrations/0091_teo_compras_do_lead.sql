-- Téo: compras pagas do lead na Eduzz pelo e-mail OU pelo telefone (últimos 8
-- dígitos do comprador). Até aqui a condição de aluno da Black só olhava o
-- e-mail, e muito lead chega sem e-mail no cadastro (14/11: 5 de 6 alunos do
-- 4º Encontro que ouviram o preço de não aluno). Devolve um produto por linha;
-- o Téo filtra o que conta (curso, imersão, Encontro, Airbnb do Zero).
create or replace function public.teo_compras_do_lead(p_emails text[], p_telefone text)
returns table (email text, produto text, quando timestamptz)
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
  )
  select lower(s.buyer_email), s.product, s.created_at
    from sales s
    left join eduzz_sales_raw r on r.id = s.eduzz_invoice_id
    cross join tel
   where s.status = 'paga'
     and (
       lower(s.buyer_email) in (select e from em)
       or (length(tel.t) = 8
           and right(regexp_replace(coalesce(r.data -> 'buyer' ->> 'phone', ''), '\D', '', 'g'), 8) = tel.t)
     )
   order by s.created_at desc
   limit 300;
$$;
