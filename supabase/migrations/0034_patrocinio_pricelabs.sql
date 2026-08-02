-- Patrocinadores internacionais pagam em dólar e o dinheiro entra pela Global
-- Account do Inter. No extrato aparece como "Resgate — Global Account", que eu
-- tinha lido como resgate de aplicação e mandado pra 'neutro' — tirando
-- R$ 68.663 de receita do faturamento.
--
-- O que denuncia que não é aplicação: vem IOF junto de cada entrada. IOF é
-- imposto de câmbio; fundo de renda fixa não cobra isso. É dólar convertendo.
--
-- PriceLabs é patrocínio do evento em R$ 25 mil mais ~USD 5.000/mês, então o
-- valor varia e às vezes acumula. Por isso a regra NÃO tem faixa de valor —
-- aqui a faixa atrapalharia, ao contrário do YouTube.
--
-- MAS os dois saques de 13/jul são patrocinadores DIFERENTES com descrição
-- idêntica: R$ 35.492 é PriceLabs e R$ 12.676 é Hostfully. Nenhuma regra
-- separa isso. O de Hostfully vai por classificação manual
-- (category_source='manual'), que é imune a qualquer regra futura.

insert into public.fin_categories (slug, group_name, name, kind) values
  ('pricelabs', 'Receitas', 'PriceLabs (patrocínio)', 'receita'),
  ('hostfully', 'Receitas', 'Hostfully (patrocínio)', 'receita')
on conflict (slug) where slug is not null do update
  set group_name = excluded.group_name,
      name       = excluded.name,
      kind       = excluded.kind;

-- fora a genérica, que mandava entrada e saída da conta global pra 'neutro'
delete from public.fin_rules
where padrao = '%Global Account%' and direction is null;

insert into public.fin_rules (prioridade, padrao, direction, category_id)
select v.prioridade, v.padrao, v.direction, c.id
from (values
  -- IOF é imposto pago de verdade: desconta do lucro. Vem antes da regra de
  -- resgate porque "IOF — Global Account" também casaria com ela.
  (18, '%IOF%',                     'out', 'impostos'),
  -- prioridade 19 pra vencer a regra '%Resgate%' (20), que continua valendo
  -- pro resgate do fundo Inter Conservador
  (19, '%Resgate%Global Account%',  'in',  'pricelabs')
) as v(prioridade, padrao, direction, slug)
join public.fin_categories c on c.slug = v.slug
where not exists (
  select 1 from public.fin_rules r
  where r.padrao = v.padrao and r.direction is not distinct from v.direction
);

-- Hostfully: o único que a regra erraria. external_id é o id do lançamento na
-- API do Inter, estável entre sincronizações.
update public.fin_transactions
set category_id = (select id from public.fin_categories where slug = 'hostfully'),
    category_source = 'manual'
where external_id = 'inter:MDAxXzAwMDE5XzQ3NjA0NzM0MF8yMDI2LTA3LTEzXzg3MzczNDIxMQ==';

select public.fin_reclassificar();
