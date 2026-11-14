-- Disparo pros alunos: o clique no botão de resposta rápida do template
-- ("Pode mandar", variante D) não dispara a automação do Unnichat que chama
-- a entrada do Téo. Em 14/11, três alunos clicaram e ficaram 20+ min sem
-- resposta. Esta varredura olha as mensagens de quem recebeu o disparo com
-- botão e ainda não está com o Téo; se a pessoa respondeu, põe o aviso na
-- fila da entrada do Téo (etapa teo-entrada), igual ao que o Unnichat faria.
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
    perform pg_sleep(0.2);
  end loop;
  return n;
end;
$$;

revoke all on function public.campanha_varrer_cliques() from public, anon, authenticated;
grant execute on function public.campanha_varrer_cliques() to service_role;

select cron.unschedule('campanha-varrer-cliques') where exists (select 1 from cron.job where jobname = 'campanha-varrer-cliques');
select cron.schedule('campanha-varrer-cliques', '*/3 * * * *', $$select public.campanha_varrer_cliques()$$);
