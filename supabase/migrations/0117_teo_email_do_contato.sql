-- Téo: e-mail que já temos do contato, pro convite da call sem perguntar
-- (Fernando, 18/11: "O Téo não devia pedir e-mail se já tivermos. O cara
-- comprou algo, não pergunta nada, vai buscar o e-mail"). Ordem: cadastro do
-- lead (unnichat_id), disparo pra alunos, compra na Eduzz e pedido na TMB pelo
-- telefone (últimos 8 dígitos, com ou sem o nono dígito), lead pelo telefone.
create or replace function public.teo_email_do_contato(p_contact text, p_telefone text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  with tel as (
    select right(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), 8) as t
  ),
  achados as (
    select 1 as ordem, lower(trim(l.email)) as email, l.updated_at as quando
      from leads l where l.unnichat_id = p_contact and l.email like '%@%'
    union all
    select 2, lower(trim(a.email)), a.sorteado_em
      from campanha_alunos a where a.contact_id = p_contact and a.email like '%@%'
    union all
    select 3, lower(trim(coalesce(s.buyer_email, r.data -> 'buyer' ->> 'email'))), s.created_at
      from sales s
      join eduzz_sales_raw r on r.id = s.eduzz_invoice_id
      cross join tel
     where length(tel.t) = 8
       and right(regexp_replace(coalesce(r.data -> 'buyer' ->> 'phone', ''), '\D', '', 'g'), 8) = tel.t
       and coalesce(s.buyer_email, r.data -> 'buyer' ->> 'email') like '%@%'
    union all
    select 4, lower(trim(p.email)), coalesce(p.criado_em, p.updated_at)
      from tmb_pedidos_raw p cross join tel
     where length(tel.t) = 8
       and right(regexp_replace(coalesce(p.data ->> 'telefone', ''), '\D', '', 'g'), 8) = tel.t
       and p.email like '%@%'
    union all
    select 5, lower(trim(l.email)), l.updated_at
      from leads l cross join tel
     where length(tel.t) = 8
       and right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 8) = tel.t
       and l.email like '%@%'
  )
  select email from achados order by ordem, quando desc nulls last limit 1;
$$;

revoke all on function public.teo_email_do_contato(text, text) from public, anon, authenticated;
grant execute on function public.teo_email_do_contato(text, text) to service_role;
