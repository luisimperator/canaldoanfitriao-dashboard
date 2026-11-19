-- Cópia dos pedidos da TMB (tmb_pedidos_raw) duas vezes por dia, em vez de
-- uma: a rota do Foley usa o status financeiro (em dia / inadimplente) pra
-- decidir quem fica nos grupos, e 4 casos divergiram porque a cópia era da
-- manhã anterior (Fernando, 19/11: "2x por dia is fine for TMB").
-- 4h45 e 16h45 UTC = 1h45 e 13h45 de Brasília. Mesmo nome = atualiza o job.
select cron.schedule('sync-tmb-pedidos', '45 4,16 * * *',
  $$ select public.sync_tmb_pedidos((current_date - 540), current_date) $$);
