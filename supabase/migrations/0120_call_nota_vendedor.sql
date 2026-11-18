-- Nota de próximo passo pro vendedor depois de cada call (src/lib/calls-feedback.ts;
-- Fernando, 18/11: "pode mandar agora e mandar sempre"): marca quando a nota foi
-- deixada no Unnichat, pra sair uma vez só por call.
alter table public.call_transcricoes add column if not exists nota_vendedor_em timestamptz;
