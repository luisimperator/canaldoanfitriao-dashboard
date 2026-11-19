-- ID do grupo "Gestão Comercial" no WhatsApp (o JID ...@g.us), pra onde o
-- OpenClaw manda o feedback de cada call junto com o privado do vendedor
-- (/api/openclaw/feedbacks devolve em grupo_whatsapp). O valor fica só no
-- banco (Fernando passou em 19/11), não no código.
alter table public.teo_config add column if not exists grupo_gestao_whatsapp text;
