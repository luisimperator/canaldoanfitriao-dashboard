-- Téo: tabela de preços que o Téo usa (com ancoragem), editável sem deploy.
alter table public.teo_config add column if not exists precos text not null default '';
