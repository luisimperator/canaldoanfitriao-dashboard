-- Téo: convites das calls pelo Microsoft Teams (Graph). A reunião é criada na
-- agenda do organizador (anfitriao@pitacus.com.br, "Canal do Anfitrião") com o
-- lead e o vendedor convidados. Tenant, app e organizador ficam na config; o
-- segredo do app fica no vault (teams_client_secret). Sem config ou com erro,
-- o convite cai no Google Meet (Apps Script), como antes.
alter table public.teo_config add column if not exists teams_tenant_id text;
alter table public.teo_config add column if not exists teams_client_id text;
alter table public.teo_config add column if not exists teams_organizador text;
update public.teo_config set
  teams_tenant_id = coalesce(teams_tenant_id, '7e316492-cd1b-4d85-b8d3-5a157ef6c7c0'),
  teams_client_id = coalesce(teams_client_id, '40f2e6db-1d8e-4c76-94f6-45a3a9693999'),
  teams_organizador = coalesce(teams_organizador, 'anfitriao@pitacus.com.br')
where id = 1;

create or replace function public.teo_teams_segredo()
returns text
language sql
security definer
set search_path to 'public'
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'teams_client_secret';
$$;
revoke all on function public.teo_teams_segredo() from public, anon, authenticated;
grant execute on function public.teo_teams_segredo() to service_role;
