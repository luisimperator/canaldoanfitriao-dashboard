-- Segurança: funções SECURITY DEFINER só rodam pela service role.
--
-- ESPELHO do que já foi aplicado em produção em 2026-09-20 (via SQL editor,
-- depois do vazamento de credenciais por infostealer). Este arquivo existe
-- pra o repositório contar a mesma história que o banco — rodar de novo é
-- inofensivo (revoke é idempotente).
--
-- O problema: no Supabase, toda função criada em `public` nasce com EXECUTE
-- concedido a PUBLIC (e, por tabela, a anon e authenticated). Uma função
-- SECURITY DEFINER roda com a permissão de quem a criou (postgres) e ignora
-- o RLS — então qualquer pessoa com a URL do projeto e a chave pública podia
-- chamar via /rest/v1/rpc/<fn>:
--
--   - whatsapp_config()          → devolve o token do WhatsApp e o app secret;
--   - asaas_raspagem_key()       → a chave que dispara a raspagem de dinheiro;
--   - distribuicao_fechar()      → crava a distribuição de lucro dos sócios;
--   - fundir_leads_duplicados()  → reescreve a base de leads;
--   - upsert_mailchimp_leads()   → grava leads arbitrários;
--   ... e todas as outras (lista abaixo).
--
-- O painel chama TODAS as RPCs pela service role (src/lib/supabase-admin.ts),
-- nunca pelo cliente anon/authenticated — então revogar de anon, authenticated
-- e PUBLIC não quebra nada no app. Triggers (stamp_mql_at,
-- propagate_buyer_from_raw, support_touch_conversa) também continuam
-- funcionando: o Postgres não checa EXECUTE ao disparar um trigger.
--
-- O loop sobre pg_proc pega TODA função SECURITY DEFINER do schema public,
-- inclusive as criadas direto pelo MCP/SQL editor que não têm arquivo aqui
-- (ex.: asaas_sync_key, seller_closing_rate, ...). As que existem nas
-- migrações deste repositório, pra referência:
--   asaas_raspagem_key, buyer_temp_month, casar_asaas_com_vendas,
--   claim_lead_for_unnichat, d0_by_day_load, distribuicao_fechar,
--   distribuicao_realizada, distribuicao_status, fin_reclassificar,
--   fundir_leads_duplicados, mql_cohort_stats, mql_new_daily,
--   politica_distribuicao, projecao_financeira, propagate_buyer_from_raw,
--   provisao_caixa, resultado_mensal, stamp_mql_at, support_touch_conversa,
--   sync_eduzz_statement, sync_mc_full, upsert_mailchimp_leads,
--   whatsapp_config.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef            -- SECURITY DEFINER
      and p.prokind in ('f', 'p') -- funções e procedures (não agregados/janela)
  loop
    -- ROUTINE cobre função e procedure (ON FUNCTION rejeita procedure).
    execute format('revoke execute on routine %s from anon, authenticated, public', fn.assinatura);
  end loop;
end
$$;

-- E que as próximas funções já nasçam fechadas: sem isso, cada `create
-- function` novo voltaria a conceder EXECUTE a PUBLIC/anon/authenticated e
-- a porta reabriria migração a migração. A service role continua com
-- EXECUTE (grant explícito do Supabase), que é o único caminho do painel.
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
