-- Hora em que a sala abre, por dia da turma (Fernando, 21/11: "Abra a sala só
-- às 10:00 mesmo"). Vazio = 30 min antes do início, como antes.
alter table public.imersao_turmas
  add column if not exists sala_abre_sabado timestamptz,
  add column if not exists sala_abre_domingo timestamptz;

update public.imersao_turmas
   set sala_abre_sabado = '2026-11-21T10:00:00-03:00'
 where turma_data = '2026-11-21';
