-- ROAS por turma do lançamento pago semanal (Fernando, 25/11: "Quero que o
-- Placar lançamentos tenha algo nesse estilo pra cada lançamento", sobre o card
-- "ROAS total | Turma 21 e 22/11" que o Foley manda no grupo).
--
-- Pra cada turma T (o sábado da Imersão):
--   Faturamento bruto = ingressos pagos da turma + pós-Imersão: vendas pagas
--     (tabela sales, sem as reembolsadas) de sábado 0h a terça 0h de quem
--     comprou o ingresso da turma (mesmo e-mail) ou com utm_campaign
--     'imersao-semanal' (oferta do fim da Imersão).
--   Taxas da Eduzz = bruto - netGain (ingressos pelo placar; pós pela fatura).
--   Imposto = politica_caixa.aliquota_simples sobre o bruto.
--   Meta Ads = gasto das campanhas CDR da semana da turma, com os 12,15% de
--     impostos da Meta (o mesmo do placar, imersao_placar).
--   WhatsApp API = modelos com "imersao" no nome de T-7 a T+1 + oferta
--     pós-Imersão (modelos "a5e_...") em T+1 e T+2, em reais (migração 0148).
--   Custo de aquisição = Meta + WhatsApp; lucro = receita líquida - custo;
--   ROAS = receita líquida / custo (a conta do card do Foley).

create or replace function public.imersao_roas(p_turma date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ini timestamptz := (p_turma::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_turma + 3)::timestamp at time zone 'America/Sao_Paulo');
  v_placar jsonb := imersao_placar(p_turma);
  v_ing_n int;
  v_ing_bruto numeric;
  v_ing_liq numeric;
  v_meta numeric;
  v_pos jsonb;
  v_pos_bruto numeric;
  v_pos_taxa numeric;
  v_wa numeric;
  v_aliq numeric;
  v_bruto numeric;
  v_taxas numeric;
  v_imposto numeric;
  v_receita numeric;
  v_custo numeric;
begin
  select coalesce(sum((d->>'ingressos')::int), 0),
         coalesce(sum((d->>'bruto')::numeric), 0),
         coalesce(sum((d->>'liquido')::numeric), 0),
         coalesce(sum((d->>'gasto')::numeric), 0)
    into v_ing_n, v_ing_bruto, v_ing_liq, v_meta
  from jsonb_array_elements(v_placar->'dias') d;

  with emails as (
    select distinct lower(email) e from imersao_compradores
    where turma_data = p_turma and status = 'pago' and email is not null
  ),
  pos as (
    select s.product,
           coalesce(s.preco, s.amount)::numeric bruto,
           coalesce((r.data->'total'->>'value')::numeric - (r.data->'netGain'->>'value')::numeric, 0) taxa
    from sales s
    left join eduzz_sales_raw r on r.id::text = s.eduzz_invoice_id::text
    where s.status = 'paga'
      and s.created_at >= v_ini and s.created_at < v_fim
      and (lower(s.buyer_email) in (select e from emails) or s.utm->>'campaign' = 'imersao-semanal')
  )
  select coalesce((select jsonb_agg(jsonb_build_object('produto', product, 'n', n, 'bruto', bruto) order by bruto desc)
                   from (select product, count(*) n, sum(bruto) bruto from pos group by 1) x), '[]'::jsonb),
         coalesce(sum(bruto), 0),
         coalesce(sum(taxa), 0)
    into v_pos, v_pos_bruto, v_pos_taxa
  from pos;

  with cambio as (
    select d::date dia,
           (select c.venda from cambio_usd_brl c where c.dia <= d::date order by c.dia desc limit 1) venda
    from generate_series(p_turma - 8, p_turma + 3, interval '1 day') d
  )
  select coalesce(sum(t.custo * case when w.moeda = 'USD' then coalesce(x.venda, 0) else 1 end), 0)
    into v_wa
  from whatsapp_template_diario t
  join whatsapp_wabas w using (waba_id)
  left join whatsapp_templates m using (template_id)
  left join cambio x on x.dia = t.dia
  where (m.nome ilike '%imersao%' and t.dia between p_turma - 7 and p_turma + 1)
     or (m.nome ilike 'a5e\_%' and t.dia between p_turma + 1 and p_turma + 2);

  select coalesce(aliquota_simples, 0) into v_aliq from politica_caixa where id = 1;
  v_aliq := coalesce(v_aliq, 0);

  v_bruto := v_ing_bruto + v_pos_bruto;
  v_taxas := greatest(v_ing_bruto - v_ing_liq, 0) + v_pos_taxa;
  v_imposto := round(v_bruto * v_aliq, 2);
  v_receita := v_bruto - v_taxas - v_imposto;
  v_custo := v_meta + v_wa;

  return jsonb_build_object(
    'turma', p_turma,
    'fechada', now() >= v_fim,
    'ingressos', v_ing_n,
    'ingressos_bruto', round(v_ing_bruto, 2),
    'pos', v_pos,
    'pos_bruto', round(v_pos_bruto, 2),
    'bruto', round(v_bruto, 2),
    'taxas_eduzz', round(v_taxas, 2),
    'aliquota', v_aliq,
    'imposto', v_imposto,
    'receita_liquida', round(v_receita, 2),
    'meta', round(v_meta, 2),
    'whatsapp', round(v_wa, 2),
    'custo', round(v_custo, 2),
    'lucro', round(v_receita - v_custo, 2),
    'roas', case when v_custo > 0 then round(v_receita / v_custo, 2) else null end
  );
end;
$$;

revoke all on function public.imersao_roas(date) from public, anon, authenticated;

-- As últimas turmas que já começaram a vender, da mais nova pra mais antiga.
create or replace function public.imersao_roas_turmas(p_n int default 8)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(public.imersao_roas(turma_data) order by turma_data desc), '[]'::jsonb)
  from (
    select turma_data from imersao_turmas
    where turma_data - 7 <= (now() at time zone 'America/Sao_Paulo')::date
    order by turma_data desc
    limit p_n
  ) t;
$$;

revoke all on function public.imersao_roas_turmas(int) from public, anon, authenticated;
