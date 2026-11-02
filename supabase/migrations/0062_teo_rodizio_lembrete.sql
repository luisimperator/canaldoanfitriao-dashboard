-- Téo: cada call tem vendedor, link do Meet, lembrete e a hora em que a
-- conversa passou pro vendedor. teo_config.vendedores lista quem atende
-- (nome, e-mail do convite e id de atendente no Unnichat).
alter table public.teo_calls add column if not exists vendedor text;
alter table public.teo_calls add column if not exists meet_url text;
alter table public.teo_calls add column if not exists lembrete_em timestamptz;
alter table public.teo_calls add column if not exists passou_vendedor_em timestamptz;
alter table public.teo_config add column if not exists vendedores jsonb not null default '[]'::jsonb;
