-- Téo: ponte com a agenda do Google. Um Apps Script publicado como app da web
-- (na conta dona da agenda) cria o evento com Meet e manda o convite pro lead
-- e pro vendedor. A URL e o segredo do script ficam no vault
-- (teo_agenda_url, teo_agenda_token); o servidor lê por esta função.
create or replace function public.teo_agenda_config()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'url', (select decrypted_secret from vault.decrypted_secrets where name = 'teo_agenda_url'),
    'token', (select decrypted_secret from vault.decrypted_secrets where name = 'teo_agenda_token')
  );
$$;
revoke all on function public.teo_agenda_config() from public, anon, authenticated;
grant execute on function public.teo_agenda_config() to service_role;
