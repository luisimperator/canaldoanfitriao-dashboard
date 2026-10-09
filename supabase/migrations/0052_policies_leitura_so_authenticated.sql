-- Segurança: policies "leitura anon" passam a valer só para authenticated.
--
-- ESPELHO do que já foi aplicado em produção em 2026-09-20 (via SQL editor,
-- depois do vazamento de credenciais por infostealer). Rodar de novo é
-- inofensivo: cada `alter policy` é guardado pela existência da policy.
--
-- As policies "leitura anon" (0001) foram criadas com `for select using
-- (true)` e sem `to <role>`, ou seja, valem para PUBLIC — anon incluído.
-- Com a URL do projeto e a chave pública (que vai no bundle do navegador),
-- qualquer um lia leads (nome, e-mail, telefone), vendas (comprador, valor,
-- documento), vendedores, gasto de mídia e o extrato do financeiro, sem
-- login nenhum.
--
-- O painel lê tudo pela service role (src/lib/supabase-admin.ts); o cliente
-- anon/authenticated só é usado pra sessão (login) e pra app_access. Então
-- restringir a leitura a `authenticated` não muda nada no app — e mesmo
-- authenticated é mais do que o painel precisa; fica assim porque é o que
-- foi aplicado em produção e fecha o buraco do anon.
--
-- Tabelas: leads, sales, sellers, ad_spend, fin_categories,
-- fin_source_files, fin_transactions, lista_espera_sync_log,
-- analytics_snapshot. As duas últimas não têm migração neste repositório
-- (criadas direto no banco) — por isso a guarda por existência.

do $$
declare
  t text;
begin
  foreach t in array array[
    'leads',
    'sales',
    'sellers',
    'ad_spend',
    'fin_categories',
    'fin_source_files',
    'fin_transactions',
    'lista_espera_sync_log',
    'analytics_snapshot'
  ]
  loop
    if exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'leitura anon'
    ) then
      execute format('alter policy "leitura anon" on public.%I to authenticated', t);
    end if;
  end loop;
end
$$;
