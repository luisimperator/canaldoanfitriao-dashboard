-- Imersão A5E: teste de versões da LP (longa × curta, e as próximas).
--
-- Cada visita e cada clique em "comprar" guarda a versão da LP que a pessoa
-- viu. A view imersao_variantes dá, por turma e versão, visitas e cliques no
-- checkout (totais e únicos) — a taxa visita → checkout de cada versão.
-- A compra em si chega pela Eduzz com as UTMs; pra atribuir venda a versão,
-- cada versão vai num anúncio/utm_content próprio.

alter table public.imersao_cliques add column if not exists variante text;

create index if not exists imersao_cliques_variante
  on public.imersao_cliques (turma_data, variante)
  where rota in ('lp', 'checkout');

create or replace view public.imersao_variantes
with (security_invoker = true) as
select
  turma_data,
  coalesce(variante, 'longa') as variante,
  count(*) filter (where rota = 'lp') as visitas,
  count(distinct visitante) filter (where rota = 'lp') as visitas_unicas,
  count(*) filter (where rota = 'checkout') as checkouts,
  count(distinct visitante) filter (where rota = 'checkout') as checkouts_unicos
from public.imersao_cliques
where rota in ('lp', 'checkout') and turma_data is not null
group by turma_data, coalesce(variante, 'longa');

revoke all on public.imersao_variantes from anon, authenticated;
