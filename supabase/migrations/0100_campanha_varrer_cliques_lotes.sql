-- Varredura do botão em lotes. A 0099 (pausa de 1 s por aluno) passou do
-- limite de 2 min do pg_cron com as ondas 1 e 2 juntas: de 17:48 a 17:57 de
-- 14/11 toda rodada foi cancelada em 120 s, e a rodada cancelada desfaz o que
-- tinha posto na fila (cliques da onda 2 ficaram sem o Téo). Agora cada rodada
-- olha no máximo 30 alunos, revezando (varrido_em) e começando por quem recebeu
-- há menos tempo: ~35 s por rodada, cada aluno olhado a cada ~10 min.
alter table public.campanha_alunos add column if not exists varrido_em timestamptz;

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
begin
  for r in
    select a.id, a.contact_id, a.telefone, a.email,
      initcap(regexp_replace(trim(coalesce(a.nome, '')), '\s+', ' ', 'g')) as nome, a.enviado_em
    from public.campanha_alunos a
    where a.template = 'D'
      and a.enviado_em is not null
      and a.enviado_em > now() - interval '3 days'
      and a.contact_id is not null
      and a.excluido is null
      and not exists (select 1 from public.teo_conversas c where c.contact_id = a.contact_id)
      and not exists (
        select 1 from public.webhook_log w
        where w.source = 'unnichat' and w.etapa = 'teo-entrada'
          and w.body->'contact'->>'id' = a.contact_id and w.created_at > a.enviado_em
      )
    order by (a.enviado_em > now() - interval '6 hours') desc, a.varrido_em nulls first, a.enviado_em desc
    limit 30
  loop
    m := null;
    j := public.teo_unnichat('GET', '/contact/' || r.contact_id || '/messages', null);
    update public.campanha_alunos set varrido_em = now() where id = r.id;
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
    perform pg_sleep(0.5);
  end loop;
  return n;
end;
$$;
