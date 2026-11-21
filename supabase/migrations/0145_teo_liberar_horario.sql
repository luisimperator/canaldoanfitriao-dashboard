-- Téo: horário de quem não confirma vai pra outra pessoa (Fernando, 21/11:
-- "confirmação na véspera e confirmação no dia. As pessoas que não responderem,
-- eu libero o horário: tô cancelando aqui, se quiser a gente remarca depois").
-- Nos últimos 60 dias, a presença cai com a antecedência: <6h 92%, 6–24h 79%,
-- 1–2 dias 55%, 2–4 dias 20%, 4 dias ou mais 25%; e quem não escreve nada nas
-- 24h antes da call quase sempre falta (estudo do Diego).
--
-- teo_calls.liberar_em: prazo da confirmação de manhã (a pessoa não escreveu
--   nas 24h antes da call). Se até lá ela não escrever, a call é cancelada e o
--   horário volta pra lista do Téo.
-- teo_calls.liberada_em / liberada_motivo: quando e por quê o horário foi
--   liberado (sem_confirmacao | lead_desmarcou | voltar_no_dia).
-- teo_config.liberar_sem_confirmacao: liga/desliga a liberação automática.
-- teo_config.template_liberada_id: template de utilidade pro aviso de horário
--   liberado com a janela de 24h fechada ({{1}} nome, {{2}} quando, {{3}} vendedor).
--   Sem ele, o aviso vai no cancelamento do convite (e-mail) e por texto quando a
--   janela estiver aberta.

alter table public.teo_calls add column if not exists liberar_em timestamptz;
alter table public.teo_calls add column if not exists liberada_em timestamptz;
alter table public.teo_calls add column if not exists liberada_motivo text;
alter table public.teo_config add column if not exists liberar_sem_confirmacao boolean not null default true;
alter table public.teo_config add column if not exists template_liberada_id text;
