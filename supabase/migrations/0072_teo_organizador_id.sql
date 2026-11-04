-- Téo: id (objeto do Entra) do organizador das calls (anfitriao@pitacus.com.br).
-- A API de reuniões online do Teams (/users/{id}/onlineMeetings) pede o id, não o e-mail.
alter table public.teo_config add column if not exists teams_organizador_id text;
update public.teo_config set teams_organizador_id = coalesce(teams_organizador_id, '9a3bb86a-037a-4fe1-a7ef-1212c8ca3dd6') where id = 1;
