-- Téo: ajustes de tom e de regra que entram no fim do prompt, editáveis sem deploy.
alter table public.teo_config add column if not exists instrucoes_extras text not null default '';
