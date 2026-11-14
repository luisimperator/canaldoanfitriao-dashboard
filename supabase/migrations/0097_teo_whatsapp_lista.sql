-- WhatsApp do Téo (tela do painel): lista das conversas do Téo com a última
-- atividade e a prévia da última mensagem. Pedido do Fernando (14/11): "quero
-- entrar e que pareça o WhatsApp, tudo que o Téo tá vendo, todas as conversas,
-- o mais perto de tempo real possível".
--
-- Última atividade = o mais recente entre o último aviso do Unnichat com
-- mensagem do lead (webhook_log 'evento') e a última coisa que o Téo mandou
-- (resposta, acompanhamento ou disparo). ~50 ms com 40 mil linhas no log.
create or replace function public.teo_whatsapp_lista(p_limite integer default 300)
returns table (
  contact_id text, nome text, telefone text, estado text, motivo_humano text,
  black_vendedor text, venda_teo boolean, respostas integer, erro text,
  ultima_em timestamptz, ultimo_texto text, ultimo_de text, disparo text
)
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select distinct on (w.body->'contact'->>'id')
           w.body->'contact'->>'id' as cid, w.created_at, w.body->'contact'->>'lastMessage' as txt
      from webhook_log w
     where w.source = 'unnichat' and w.note = 'evento' and w.created_at > now() - interval '30 days'
       and coalesce(w.body->'contact'->>'lastMessage', '') <> ''
     order by w.body->'contact'->>'id', w.created_at desc
  ),
  teo as (
    select distinct on (w.body->>'contact_id')
           w.body->>'contact_id' as cid, w.created_at,
           coalesce(w.body->'enviadas'->>-1, w.note) as txt
      from webhook_log w
     where w.source = 'teo' and w.created_at > now() - interval '30 days' and w.body ? 'contact_id'
       and (w.note = 'respondeu' or w.note like 'acompanhamento%' or w.note like 'disparo%')
     order by w.body->>'contact_id', w.created_at desc
  )
  select c.contact_id, c.nome, c.telefone, c.estado, c.motivo_humano, c.black_vendedor, c.venda_teo,
         c.respostas, c.erro,
         greatest(ev.created_at, teo.created_at, c.criado_em) as ultima_em,
         case when coalesce(ev.created_at, '-infinity') >= coalesce(teo.created_at, '-infinity') then ev.txt else teo.txt end,
         case when ev.created_at is null and teo.created_at is null then null
              when coalesce(ev.created_at, '-infinity') >= coalesce(teo.created_at, '-infinity') then 'lead' else 'teo' end,
         (select 'onda ' || a.onda || ' · ' || a.template from campanha_alunos a
           where a.contact_id = c.contact_id and a.enviado_em is not null order by a.onda desc limit 1)
    from teo_conversas c
    left join ev on ev.cid = c.contact_id
    left join teo on teo.cid = c.contact_id
   order by 10 desc nulls last
   limit p_limite;
$$;

revoke all on function public.teo_whatsapp_lista(integer) from public, anon, authenticated;
grant execute on function public.teo_whatsapp_lista(integer) to service_role;
