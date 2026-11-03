-- Téo: respostas do formulário de inscrição do site (Mailchimp: nº de imóveis,
-- faturamento), guardadas na conversa pra ele não perguntar de novo.
alter table public.teo_conversas add column if not exists formulario jsonb;
alter table public.teo_conversas add column if not exists formulario_em timestamptz;
