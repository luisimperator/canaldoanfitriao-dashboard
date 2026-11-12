-- Mapa dos alunos: uma linha por comprador (pelo e-mail), com o nome, o DDD
-- do telefone, a cidade/UF do endereço (só a TMB tem endereço; a Eduzz tem só
-- o telefone), se é aluno de curso e a data da última compra de curso (pra
-- separar aluno ativo de ex-aluno). Lido ao vivo pela página /mapa, então
-- entra comprador novo sem precisar rodar nada.
--
-- Curso = Anfitrião 5 Estrelas (e renovação), Gigantes da Temporada,
-- Sublocação, Curso de Booking, Black Friday Histórica, Airbnb do Zero e
-- mentoria. Imersões, encontros, kits e produtos avulsos contam como cliente.
-- A chave da pessoa sai como md5 do e-mail: o e-mail não vai pra página.

create or replace function public.mapa_alunos()
returns table (
  id text,
  nome text,
  ddd text,
  uf text,
  cidade text,
  curso boolean,
  ultima_curso date,
  ultima_compra date,
  produtos text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with compras as (
    select lower(trim(s.buyer_email)) as pessoa,
           coalesce(nullif(trim(s.buyer_name), ''), r.data -> 'buyer' ->> 'name') as nome,
           regexp_replace(coalesce(r.data -> 'buyer' ->> 'phone', ''), '\D', '', 'g') as fone,
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
           regexp_replace(coalesce(p.data ->> 'telefone', ''), '\D', '', 'g'),
           nullif(trim(p.data ->> 'endereco_cidade'), ''),
           upper(nullif(trim(p.data ->> 'endereco_estado'), '')),
           coalesce(p.lancamento, ''),
           coalesce(p.criado_em, p.updated_at)::date
      from tmb_pedidos_raw p
     where p.status_pedido = 'Efetivado' and coalesce(trim(p.email), '') <> ''
  ),
  marcadas as (
    select c.*,
           (c.produto ~* '(anfitri.o 5 estrelas|gigantes da temporada|subloca|curso de booking|black friday hist|airbnb do zero|mentoria)'
             and c.produto !~* '(encontro|imers|ingresso)') as eh_curso,
           case
             when length(c.fone) in (12, 13) and left(c.fone, 2) = '55' then substr(c.fone, 3, 2)
             when length(c.fone) in (10, 11) then left(c.fone, 2)
             when c.fone <> '' then 'EX'
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
      from compras c
  )
  select md5(m.pessoa),
         (array_agg(m.nome order by (m.nome is null), m.dia desc))[1],
         (array_agg(m.ddd_fone order by (m.ddd_fone is null), m.dia desc))[1],
         (array_agg(m.uf order by (m.uf is null), m.dia desc))[1],
         (array_agg(m.cidade order by (m.cidade is null), m.dia desc))[1],
         bool_or(m.eh_curso),
         max(m.dia) filter (where m.eh_curso),
         max(m.dia),
         string_agg(distinct m.familia, ' · ') filter (where m.eh_curso)
    from marcadas m
   group by m.pessoa;
$$;

revoke all on function public.mapa_alunos() from public, anon, authenticated;
grant execute on function public.mapa_alunos() to service_role;
