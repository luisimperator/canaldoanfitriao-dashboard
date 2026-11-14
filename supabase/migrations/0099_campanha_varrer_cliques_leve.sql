-- Varredura do botão mais leve. Com as ondas 1 e 2, cada rodada passou de ~37 s
-- pra ~75 s (uma leitura no Unnichat por aluno da variante D, sem pausa), e o
-- Unnichat começou a devolver 502/503 e "HTTP request cancelled" pro Téo bem
-- nesses minutos (14/11, 17:33–17:41). Agora:
--   - no máximo uma leitura por segundo (pausa de 1 s);
--   - quem recebeu o disparo há menos de 6 h é olhado a cada rodada (3 min);
--     depois disso, só na rodada que cai nos primeiros 3 minutos de cada 15.
create or replace function public.campanha_varrer_cliques()
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  r record;
  j jsonb;
  m jsonb;
  n integer := 0;
  v_rodada_longa boolean := (extract(minute from now())::int % 15) < 3;
begin
  for r in
    select a.id, a.contact_id, a.telefone, a.email,
      initcap(regexp_replace(trim(coalesce(a.nome, '')), '\s+', ' ', 'g')) as nome, a.enviado_em
    from public.campanha_alunos a
    where a.template = 'D'
      and a.enviado_em is not null
      and a.enviado_em > now() - interval '3 days'
      and (a.enviado_em > now() - interval '6 hours' or v_rodada_longa)
      and a.contact_id is not null
      and a.excluido is null
      and not exists (select 1 from public.teo_conversas c where c.contact_id = a.contact_id)
      and not exists (
        select 1 from public.webhook_log w
        where w.source = 'unnichat' and w.etapa = 'teo-entrada'
          and w.body->'contact'->>'id' = a.contact_id and w.created_at > a.enviado_em
      )
  loop
    m := null;
    j := public.teo_unnichat('GET', '/contact/' || r.contact_id || '/messages', null);
    select x into m
      from jsonb_array_elements(case when jsonb_typeof(j->'body'->'data') = 'array' then j->'body'->'data' else '[]'::jsonb end) x
      where x->>'senderBy' = 'contact' and (x->>'date')::timestamptz > r.enviado_em
      order by (x->>'date')::timestamptz desc
      limit 1;
    if m is not null then
      insert into public.webhook_log (source, note, body, pendente, etapa)
      values ('unnichat', 'evento', jsonb_build_object(
        'contact', jsonb_build_object(
          'id', r.contact_id, 'name', r.nome, 'phoneNumber', r.telefone, 'email', r.email,
          'tags', '', 'fields', '{}'::jsonb,
          'lastMessage', m->>'message',
          'lastMessageData', jsonb_build_object('id', m->>'id', 'message', m->>'message', 'messageType', m->>'type')),
        'event_date', extract(epoch from now())::bigint,
        'triggerData', '{}'::jsonb,
        '_manual', 'resposta ao disparo sem aviso do Unnichat (varredura campanha_varrer_cliques)'),
        true, 'teo-entrada');
      n := n + 1;
    end if;
    perform pg_sleep(1);
  end loop;
  return n;
end;
$$;
