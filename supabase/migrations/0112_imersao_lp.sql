-- Imersão A5E: LP de venda própria (link.canaldoanfitriao.com.br/
-- imersao-chuva-de-reservas-airbnb) entra no funil da turma.
--
-- imersao_cliques ganha duas rotas:
--   lp       = visita à LP (turma = a que está à venda no momento da visita)
--   checkout = clique em "Garantir meu ingresso" (redirect pro checkout Eduzz)
-- e o resumo por turma ganha visitas e cliques no checkout (únicos e totais).

alter table public.imersao_cliques drop constraint if exists imersao_cliques_rota_check;
alter table public.imersao_cliques
  add constraint imersao_cliques_rota_check check (rota in ('imersao', 'vip', 'lp', 'checkout'));

create or replace view public.imersao_resumo
with (security_invoker = true) as
select
  t.turma_data,
  coalesce(c.pagos, 0) as pagos,
  coalesce(c.reembolsados, 0) as reembolsados,
  coalesce(c.receita, 0) as receita,
  coalesce(c.mailchimp_pendentes, 0) as mailchimp_pendentes,
  coalesce(c.unnichat_pendentes, 0) as unnichat_pendentes,
  coalesce(k.vip_cliques, 0) as vip_cliques,
  coalesce(k.vip_unicos, 0) as vip_unicos,
  coalesce(k.sabado_cliques, 0) as sabado_cliques,
  coalesce(k.sabado_unicos, 0) as sabado_unicos,
  coalesce(k.domingo_cliques, 0) as domingo_cliques,
  coalesce(k.domingo_unicos, 0) as domingo_unicos,
  coalesce(k.fora_cliques, 0) as fora_cliques,
  coalesce(k.lp_visitas, 0) as lp_visitas,
  coalesce(k.lp_unicos, 0) as lp_unicos,
  coalesce(k.checkout_cliques, 0) as checkout_cliques,
  coalesce(k.checkout_unicos, 0) as checkout_unicos
from public.imersao_turmas t
left join (
  select turma_data,
    count(*) filter (where status = 'pago') as pagos,
    count(*) filter (where status = 'reembolsado') as reembolsados,
    sum(valor) filter (where status = 'pago') as receita,
    count(*) filter (where status = 'pago' and not tags_mailchimp_ok) as mailchimp_pendentes,
    count(*) filter (where status = 'pago' and not tags_unnichat_ok) as unnichat_pendentes
  from public.imersao_compradores
  group by turma_data
) c using (turma_data)
left join (
  select turma_data,
    count(*) filter (where rota = 'vip') as vip_cliques,
    count(distinct visitante) filter (where rota = 'vip') as vip_unicos,
    count(*) filter (where rota = 'imersao' and momento = 'sabado') as sabado_cliques,
    count(distinct visitante) filter (where rota = 'imersao' and momento = 'sabado') as sabado_unicos,
    count(*) filter (where rota = 'imersao' and momento = 'domingo') as domingo_cliques,
    count(distinct visitante) filter (where rota = 'imersao' and momento = 'domingo') as domingo_unicos,
    count(*) filter (where rota = 'imersao' and momento not in ('sabado', 'domingo')) as fora_cliques,
    count(*) filter (where rota = 'lp') as lp_visitas,
    count(distinct visitante) filter (where rota = 'lp') as lp_unicos,
    count(*) filter (where rota = 'checkout') as checkout_cliques,
    count(distinct visitante) filter (where rota = 'checkout') as checkout_unicos
  from public.imersao_cliques
  where turma_data is not null
  group by turma_data
) k using (turma_data);

revoke all on public.imersao_resumo from anon, authenticated;
