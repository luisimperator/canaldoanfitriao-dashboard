-- Sync do Asaas de hora em hora: puxa cobranças/clientes e casa as que forem
-- continuação de venda da Eduzz. Janela de 120 dias cobre entrada + saldo com
-- folga; o upsert por id evita duplicar.
select cron.schedule('sync-asaas', '40 * * * *', $$
  select extensions.http_get(
    'https://painel.canaldoanfitriao.com.br/api/import/asaas?dias=120&key='
    || public.asaas_sync_key()
  )
$$);
