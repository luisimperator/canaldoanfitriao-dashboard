-- Chave do link .ics da agenda das calls (/api/agenda/calls.ics?k=...), que o
-- time assina no Google Agenda só pra acompanhar. Trocar a chave invalida os
-- links antigos.
alter table public.teo_config add column if not exists agenda_token text;
