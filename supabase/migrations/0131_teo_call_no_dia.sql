-- Call no próprio dia (Fernando, 19/11: "Teo precisa parar de marcar call pra
-- semana que vem", "a prioridade seja lotar o dia corrente de calls" e "vamos
-- aplicar as sugestões que vc trouxe", do estudo do Diego).
--
-- teo_conversas.call_retorno_em: o lead só pode num dia depois de amanhã; em
-- vez de marcar com antecedência, o Téo combina de voltar nesse dia de manhã
-- (ferramenta voltar_no_dia) e oferece os horários do próprio dia.
alter table public.teo_conversas add column if not exists call_retorno_em timestamptz;

-- teo_calls.confirmacao_em: regra das 24h. No dia da call, o lead calado há 24h
-- recebe uma pergunta que pede resposta ("prefere vídeo ou que o vendedor te
-- ligue?"). alerta_silencio_em: 1h antes, se ele seguir calado, nota pro
-- vendedor ligar.
alter table public.teo_calls
  add column if not exists confirmacao_em timestamptz,
  add column if not exists alerta_silencio_em timestamptz;
