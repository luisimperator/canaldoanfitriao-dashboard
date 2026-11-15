-- Desliga o pg_cron 'sync-mc-full' (0006). Fernando, 14/11: "pode cancelar".
-- Ele nunca terminou: 570 rodadas desde 15/06, todas cortadas aos 2 min
-- ("HTTP request cancelled"; o SET statement_timeout da função não vale pro
-- comando que o pg_cron já começou). E não deve voltar como está: se
-- terminasse, re-dataria os leads antigos (created_at = timestamp_signup) e
-- trocaria as tags em vez de somar. O Mailchimp entra pelo cron da Vercel
-- (/api/sync/mailchimp, de 2 em 2 h, incremental, via upsert_mailchimp_leads).
-- A função public.sync_mc_full fica no banco, sem agendamento.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-mc-full') then
    perform cron.unschedule('sync-mc-full');
  end if;
end $$;
