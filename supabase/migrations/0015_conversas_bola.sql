-- Conversas do WhatsApp: de quem é a "bola" e o efeito da velocidade de
-- resposta no fechamento.
--
-- 1) conversations_overview(): a lista da página /conversas + last_sender
--    (quem mandou a última mensagem: 'contact' = lead esperando o VENDEDOR;
--    'user'/'platform' = bola com o lead). O array messages é cronológico,
--    então o último elemento é a última mensagem.
--
-- 2) conversation_response_stats(): taxa de fechamento por velocidade da
--    1ª resposta HUMANA do vendedor (senderBy='user' sem origin — exclui
--    automação), no histórico completo. É o dado que prova que responder
--    rápido fecha venda: won/(won+lost) por faixa de atraso.

drop function if exists public.conversations_overview();

create function public.conversations_overview()
returns table (
  contact_id text,
  contact_name text,
  seller text,
  outcome text,
  msg_count integer,
  last_at timestamptz,
  email text,
  phone text,
  last_sender text
)
language sql
stable
as $$
  select
    c.contact_id,
    c.contact_name,
    c.seller,
    c.outcome,
    c.msg_count,
    c.last_at,
    c.email,
    c.phone,
    c.messages->-1->>'senderBy' as last_sender
  from public.conversations c
  order by c.last_at desc nulls last;
$$;

drop function if exists public.conversation_response_stats();

create function public.conversation_response_stats()
returns table (
  bucket text,
  ord integer,
  conversas bigint,
  won bigint,
  lost bigint
)
language sql
stable
as $$
  with conv as (
    select
      c.outcome,
      (select min((m->>'date')::timestamptz) from jsonb_array_elements(c.messages) m) as arrival,
      (
        select min((m->>'date')::timestamptz)
        from jsonb_array_elements(c.messages) m
        where m->>'senderBy' = 'user' and (m->>'origin') is null
      ) as first_human
    from public.conversations c
    where c.messages is not null and c.seller is not null
  ),
  b as (
    select
      outcome,
      case
        when first_human is null then 'nunca respondida'
        when first_human - arrival <= interval '24 hours' then 'até 24h'
        when first_human - arrival <= interval '72 hours' then '1–3 dias'
        else '3+ dias'
      end as bucket,
      case
        when first_human is null then 4
        when first_human - arrival <= interval '24 hours' then 1
        when first_human - arrival <= interval '72 hours' then 2
        else 3
      end as ord
    from conv
  )
  select
    bucket,
    ord,
    count(*)::bigint as conversas,
    count(*) filter (where outcome = 'won')::bigint as won,
    count(*) filter (where outcome = 'lost')::bigint as lost
  from b
  group by bucket, ord
  order by ord;
$$;
