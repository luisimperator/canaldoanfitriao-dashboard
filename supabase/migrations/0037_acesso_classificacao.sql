-- A tela de Classificação (/financeiro/classificar) entra como aba própria,
-- concedida a quem já tem /financeiro — mesma lógica da 0035: canAccess() casa
-- a aba exata e não herda da aba-pai, de propósito.

update public.app_access
set tabs = tabs || '{/financeiro/classificar}'::text[]
where '/financeiro' = any(tabs)
  and not ('/financeiro/classificar' = any(tabs));
