-- Re-sync contínuo das conversas do Unnichat (correção da auditoria de 05/07).
--
-- PROBLEMA: sync_conversations_pending() só re-sincronizava um contato quando
-- chegava um lead_event NOVO depois da última foto (c.updated_at < max(event_at)).
-- A resposta do vendedor no WhatsApp não gera lead_event — então a conversa era
-- fotografada na chegada do lead e nunca mais. Resultado: 82% dos "nunca
-- conversados" dos últimos 30 dias tinham foto tirada <36h após a chegada, e o
-- speed-to-lead/d0 degradava silenciosamente desde 21/06.
--
-- CORREÇÃO: além do critério por evento, re-sincroniza toda conversa com
-- mensagem nos últimos 21 dias cuja foto tem mais de 20 horas (na prática, um
-- refresh diário enquanto a conversa está viva). Cada contato custa ~3s (duas
-- chamadas HTTP à API do Unnichat), então o lote é de 40 por execução para
-- caber com folga no statement_timeout de 280s — acima disso a transação
-- inteira reverte e o cron não avança nada. O cron passa a rodar de hora em
-- hora (cron.alter_job abaixo): 24×40 = 960/dia, acima da necessidade em
-- regime (~450/dia) e suficiente para limpar o backlog acumulado em ~15h.
--
-- Ordem de atendimento: primeiro quem tem evento novo (prio 0), depois as
-- fotos mais antigas — o limite rotaciona de forma justa entre as pendências.

create or replace function public.sync_conversations_pending()
returns integer
language plpgsql
security definer
set search_path = public
set statement_timeout = '280000'
as $$
declare r record; n int := 0;
begin
  for r in
    with evento_novo as (
      select le.unnichat_id, 0 as prio,
             coalesce(c.updated_at, 'epoch'::timestamptz) as foto
      from (
        select unnichat_id, max(event_at) as me
        from public.lead_events
        where unnichat_id is not null
        group by 1
      ) le
      left join public.conversations c on c.contact_id = le.unnichat_id
      where c.contact_id is null or c.updated_at < le.me
    ),
    conversa_ativa as (
      select c.contact_id as unnichat_id, 1 as prio, c.updated_at as foto
      from public.conversations c
      where c.last_at >= now() - interval '21 days'
        and c.updated_at < now() - interval '20 hours'
    ),
    alvo as (
      select distinct on (unnichat_id) unnichat_id, prio, foto
      from (
        select * from evento_novo
        union all
        select * from conversa_ativa
      ) u
      order by unnichat_id, prio
    )
    select unnichat_id from alvo order by prio, foto limit 40
  loop
    perform public.sync_contact_messages(r.unnichat_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- O job "sync-conversations" (jobid 9) passa de "20 */3 * * *" para hora em
-- hora, compensando o lote menor.
select cron.alter_job(9, schedule => '20 * * * *');
