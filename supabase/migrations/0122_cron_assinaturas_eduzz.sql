-- Atualização das assinaturas da Eduzz (assinaturas_eduzz), que a rota do
-- Foley usa pra dizer quem fica nos grupos. Estava parada desde 15/11: a
-- função existia (0103) mas nada a chamava.
--
-- Por janela de criação, porque a paginação da Eduzz não é estável (0103).
-- As assinaturas recentes mudam mais (renovação, atraso de 7 dias): de 2 em 2
-- horas. As antigas quase sempre já estão canceladas: duas vezes por dia.
select cron.schedule('assin-sync-2026', '35 */2 * * *',
  $$ select public.assin_sync_eduzz_janela(date '2026-01-01', current_date + 1) $$);
select cron.schedule('assin-sync-2025', '45 */2 * * *',
  $$ select public.assin_sync_eduzz_janela(date '2025-01-01', date '2026-01-01') $$);
select cron.schedule('assin-sync-antigas', '55 5,17 * * *',
  $$ select public.assin_sync_eduzz_janela(date '2022-01-01', date '2025-01-01') $$);
