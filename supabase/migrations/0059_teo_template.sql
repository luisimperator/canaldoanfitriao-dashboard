-- Téo: quando a janela de 24h está fechada, a conversa só abre com template
-- aprovado (o padrão é o "convite_de_call"). Guarda quando foi mandado, pra
-- mandar uma vez só.
alter table public.teo_conversas add column if not exists template_em timestamptz;
alter table public.teo_config add column if not exists template_abertura_id text default '1608348171079663';
update public.teo_config set template_abertura_id = coalesce(template_abertura_id, '1608348171079663') where id = 1;
