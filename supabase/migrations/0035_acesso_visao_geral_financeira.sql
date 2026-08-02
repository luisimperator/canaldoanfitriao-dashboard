-- A Visão geral financeira entra como aba própria (/financeiro/visao-geral).
--
-- canAccess() casa a aba exata, sem herdar da aba-pai — e isso é de propósito:
-- tem usuário com /suporte/inbox, /suporte/simulador e /suporte/treinamento
-- liberados um a um, mas sem /suporte/avisos. Herança automática daria acesso
-- que ninguém concedeu.
--
-- Então a aba nova precisa ser concedida explicitamente. Vai pra quem já tem
-- /financeiro: quem enxerga o extrato inteiro já enxerga tudo que a visão geral
-- resume. Admin não precisa (canAccess libera geral).

update public.app_access
set tabs = tabs || '{/financeiro/visao-geral}'::text[]
where '/financeiro' = any(tabs)
  and not ('/financeiro/visao-geral' = any(tabs));
