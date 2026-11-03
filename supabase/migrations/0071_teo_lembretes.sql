-- Téo: ritmo de lembretes antes da call.
-- * véspera às 18h ("amanhã às 15h com o Flávio, tá de pé?") -> vespera_em
-- * 90 min antes, com o link (já existia) -> lembrete_em
-- * 3 min depois do horário: "o Flávio já está na sala te esperando" -> esperando_em
-- Com a janela de 24h fechada, os três saem pelo template de utilidade
-- "lembrete_call" (template_lembrete_id; {{1}} nome, {{2}} vendedor, {{3}} quando).
-- Sem o template configurado, fica só o registro "sem janela".
alter table public.teo_calls add column if not exists vespera_em timestamptz;
alter table public.teo_calls add column if not exists esperando_em timestamptz;
alter table public.teo_config add column if not exists template_lembrete_id text;
