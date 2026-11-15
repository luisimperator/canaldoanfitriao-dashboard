-- Mapa dos alunos no mundo: mapa_alunos2() é a mapa_alunos() (0086) com duas
-- mudanças.
-- 1. Telefone brasileiro escrito com o 0 da operadora ou do DDD na frente
--    (012 99783-5946, 0 41 71 99134-5850) agora conta como Brasil, no DDD
--    certo, em vez de cair no "exterior".
-- 2. Quem fica fora do Brasil sai com o telefone como foi digitado (fone_ex),
--    pra página descobrir o país pelo código internacional. O telefone fica
--    no servidor: a página manda pro navegador só o país.

create or replace function public.mapa_alunos2()
returns table (
  id text,
  nome text,
  ddd text,
  uf text,
  cidade text,
  curso boolean,
  ultima_curso date,
  ultima_compra date,
  produtos text,
  fone_ex text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with compras as (
    select lower(trim(s.buyer_email)) as pessoa,
           coalesce(nullif(trim(s.buyer_name), ''), r.data -> 'buyer' ->> 'name') as nome,
           trim(coalesce(r.data -> 'buyer' ->> 'phone', '')) as fone_raw,
           null::text as cidade,
           null::text as uf,
           coalesce(s.product, '') as produto,
           coalesce(s.sale_date, s.created_at::date) as dia
      from sales s
      left join eduzz_sales_raw r on r.id = s.eduzz_invoice_id
     where s.status = 'paga' and coalesce(trim(s.buyer_email), '') <> ''
    union all
    select lower(trim(p.email)),
           nullif(trim(p.cliente), ''),
           trim(coalesce(p.data ->> 'telefone', '')),
           nullif(trim(p.data ->> 'endereco_cidade'), ''),
           upper(nullif(trim(p.data ->> 'endereco_estado'), '')),
           coalesce(p.lancamento, ''),
           coalesce(p.criado_em, p.updated_at)::date
      from tmb_pedidos_raw p
     where p.status_pedido = 'Efetivado' and coalesce(trim(p.email), '') <> ''
  ),
  com_fone as (
    select c.*, regexp_replace(c.fone_raw, '\D', '', 'g') as fone
      from compras c
  ),
  marcadas as (
    select c.*,
           (c.produto ~* '(anfitri.o 5 estrelas|gigantes da temporada|subloca|curso de booking|black friday hist|airbnb do zero|mentoria)'
             and c.produto !~* '(encontro|imers|ingresso)') as eh_curso,
           case
             when c.fone = '' or c.fone ~ '^0+$' then null
             -- +55 / 55 + DDD + número
             when length(c.fone) in (12, 13) and left(c.fone, 2) = '55' then substr(c.fone, 3, 2)
             -- DDD + número
             when length(c.fone) in (10, 11) and left(c.fone, 1) <> '0' and c.fone_raw !~ '^\s*\+' then left(c.fone, 2)
             -- 0 + DDD + número (celular de 9 dígitos começa com 9)
             when length(c.fone) in (11, 12) and c.fone ~ '^0[1-9][1-9]' and c.fone_raw !~ '^\s*\+'
                  and (length(c.fone) = 11 or substr(c.fone, 4, 1) = '9') then substr(c.fone, 2, 2)
             -- 0 + operadora + DDD + número
             when length(c.fone) in (13, 14) and c.fone ~ '^0[1-9][0-9][1-9][1-9]' and c.fone_raw !~ '^\s*\+'
                  and (length(c.fone) = 13 or substr(c.fone, 6, 1) = '9') then substr(c.fone, 4, 2)
             else 'EX'
           end as ddd_fone,
           case
             when c.produto ~* 'gigantes' then 'Gigantes'
             when c.produto ~* 'black friday' then 'Black'
             when c.produto ~* 'subloca' then 'Sublocação'
             when c.produto ~* 'booking' then 'Booking'
             when c.produto ~* 'airbnb do zero' then 'Airbnb do Zero'
             when c.produto ~* 'mentoria' then 'Mentoria'
             when c.produto ~* 'anfitri.o 5 estrelas' then 'Anfitrião 5 Estrelas'
           end as familia
      from com_fone c
  )
  select md5(m.pessoa),
         (array_agg(m.nome order by (m.nome is null), m.dia desc))[1],
         (array_agg(m.ddd_fone order by (m.ddd_fone is null), m.dia desc))[1],
         (array_agg(m.uf order by (m.uf is null), m.dia desc))[1],
         (array_agg(m.cidade order by (m.cidade is null), m.dia desc))[1],
         bool_or(m.eh_curso),
         max(m.dia) filter (where m.eh_curso),
         max(m.dia),
         string_agg(distinct m.familia, ' · ') filter (where m.eh_curso),
         (array_agg(m.fone_raw order by m.dia desc) filter (where m.ddd_fone = 'EX'))[1]
    from marcadas m
   group by m.pessoa;
$$;

revoke all on function public.mapa_alunos2() from public, anon, authenticated;
grant execute on function public.mapa_alunos2() to service_role;
