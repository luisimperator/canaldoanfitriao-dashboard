-- Velocidade no atendimento (speed-to-lead) por vendedor, com distribuição de
-- atraso: dia 0, D+1, D+2, D+3 ou mais, e "não conversado".
--
-- A partir da tabela `conversations` (Unnichat), por vendedor:
--   - atribuidos : conversas atribuídas ao vendedor
--   - conversados: tiveram ao menos 1 mensagem HUMANA do vendedor
--                  (senderBy='user' e origin NULO — exclui automação/templates)
--   - d0/d1/d2/d3plus: quantos dias após a chegada do lead (1ª mensagem da
--                  conversa) veio a 1ª mensagem humana
--   - nunca      : nunca tiveram mensagem humana
--
-- Exclui "Fernando Imperator" (não é vendedor). Janela: chegada nos últimos
-- p_days dias.

drop function if exists public.seller_speed_to_lead(integer);

create function public.seller_speed_to_lead(p_days int default 90)
returns table (
  seller text,
  atribuidos bigint,
  conversados bigint,
  d0 bigint,
  d1 bigint,
  d2 bigint,
  d3plus bigint,
  nunca bigint
)
language sql
stable
as $$
  with conv as (
    select
      c.seller,
      (select min((m->>'date')::timestamptz) from jsonb_array_elements(c.messages) m) as arrival,
      (
        select min((m->>'date')::timestamptz)
        from jsonb_array_elements(c.messages) m
        where m->>'senderBy' = 'user' and (m->>'origin') is null
      ) as first_human
    from public.conversations c
    where c.seller is not null
      and c.messages is not null
      and regexp_replace(lower(c.seller), '\s+', ' ', 'g') <> 'fernando imperator'
  ),
  lagged as (
    select
      seller,
      arrival,
      -- atraso em DIAS ÚTEIS (exclui sáb/dom): lead que chega sexta e é atendido
      -- segunda conta como 1 dia útil, não 3. Mesmo dia útil = 0.
      case when first_human is null then null
        else greatest(0, (
          select count(*)
          from generate_series(arrival::date, first_human::date, interval '1 day') g
          where extract(isodow from g) between 1 and 5
        ) - 1)
      end as lag
    from conv
    where arrival >= (current_date - p_days)
  )
  select
    coalesce(seller, '(sem vendedor)') as seller,
    count(*)::bigint as atribuidos,
    count(*) filter (where lag is not null)::bigint as conversados,
    count(*) filter (where lag = 0)::bigint as d0,
    count(*) filter (where lag = 1)::bigint as d1,
    count(*) filter (where lag = 2)::bigint as d2,
    count(*) filter (where lag >= 3)::bigint as d3plus,
    count(*) filter (where lag is null)::bigint as nunca
  from lagged
  group by seller
  order by atribuidos desc;
$$;
