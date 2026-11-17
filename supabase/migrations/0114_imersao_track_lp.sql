-- Contador próprio da LP da Imersão (/t/pv e /t/click, sendBeacon do navegador):
-- imersao_cliques ganha as rotas 'lp_pv' e 'lp_click'. As views do funil
-- (imersao_resumo, imersao_variantes) seguem contando só 'lp' e 'checkout',
-- que o servidor já grava, então nada dobra.
alter table public.imersao_cliques drop constraint if exists imersao_cliques_rota_check;
alter table public.imersao_cliques
  add constraint imersao_cliques_rota_check check (rota in ('imersao', 'vip', 'lp', 'checkout', 'lp_pv', 'lp_click'));
