-- Limpeza: remove backfill_conversas_step().
--
-- ESPELHO do que já foi aplicado em produção em 2026-09-20 (via SQL editor,
-- depois do vazamento de credenciais por infostealer). `drop ... if exists`
-- é idempotente.
--
-- A função foi criada direto no banco (não tem migração aqui) pra um
-- backfill pontual das conversas do atendimento. Já cumpriu a função; ficar
-- exposta como RPC é só superfície de ataque a mais — e nada no painel a
-- chama (grep em src/ não encontra "backfill_conversas").

drop function if exists public.backfill_conversas_step();
