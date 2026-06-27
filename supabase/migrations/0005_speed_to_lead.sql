-- Velocidade no atendimento (speed-to-lead) por vendedor.
--
-- A partir da tabela `conversations` (Unnichat), mede, por vendedor:
--   - atribuidos : conversas atribuídas ao vendedor
--   - conversados: que tiveram ao menos 1 mensagem HUMANA do vendedor
--                  (senderBy='user' e origin NULO — exclui automação/templates)
--   - dia0       : conversados cuja 1ª mensagem humana foi no MESMO dia em que o
--                  lead chegou (1ª mensagem da conversa)
--
-- Janela: leads que chegaram nos últimos p_days dias.

create or replace function public.seller_speed_to_lead(p_days int default 90)
returns table (
  seller text,
  atribuidos bigint,
  conversados bigint,
  dia0 bigint
)
language sql
stable
as $$
  with conv as (
    select
      c.seller,
      (
        select min((m->>'date')::timestamptz)
        from jsonb_array_elements(c.messages) m
      ) as arrival,
      (
        select min((m->>'date')::timestamptz)
        from jsonb_array_elements(c.messages) m
        where m->>'senderBy' = 'user' and (m->>'origin') is null
      ) as first_human
    from public.conversations c
    where c.seller is not null and c.messages is not null
  )
  select
    coalesce(seller, '(sem vendedor)') as seller,
    count(*)::bigint as atribuidos,
    count(*) filter (where first_human is not null)::bigint as conversados,
    count(*) filter (
      where first_human is not null and first_human::date = arrival::date
    )::bigint as dia0
  from conv
  where arrival >= (current_date - p_days)
  group by seller
  order by atribuidos desc;
$$;
