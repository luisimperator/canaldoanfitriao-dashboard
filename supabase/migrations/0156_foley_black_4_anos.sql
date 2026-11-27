-- Black Friday Histórica = 4 anos de grupo, nos dois grupos (Fernando, 26/11:
-- "quem comprou black tem 4 anos de grupos, nos dois grupos se quiser").
--
-- Até aqui a regra do Foley tratava a Black (Eduzz 2914907, sem assinatura)
-- como "compra Eduzz fora de assinatura", que vale 12 meses, e o boleto da
-- TMB (produto 27029) como qualquer TMB quitada, também 12 meses. Os 82
-- compradores de nov/dez 2025 começariam a sair em 27/11/2026.
--
-- Agora:
-- • Black paga na Eduzz ou efetivada na TMB (adimplente ou quitada) nos
--   últimos 4 anos = fica, nos dois grupos (motivo 'black_4_anos', fonte
--   "Black Friday (4 anos)", valido_ate = pagamento + 4 anos);
-- • reembolso de OUTRA compra não tira quem tem a Black paga; reembolso ou
--   cancelamento da própria Black continua tirando.
-- O resto da regra é a mesma de antes (0127 + 0135).

create or replace function public.foley_situacao_regra(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '60000'
as $function$
declare
  v jsonb;
begin
  with itens as (
    select ord::int ord,
           it->>'telefone' telefone,
           public.assin_chave_tel(it->>'telefone') chave,
           nullif(lower(trim(it->>'email')), '') email,
           case when lower(coalesce(it->>'grupo', '')) like 'gig%' then 'gigantes' else 'a5e' end grupo
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) with ordinality t(it, ord)
  ),
  prods as (
    select distinct produto_eduzz_id pid,
           case when nome_grupo ilike '%gigantes%' then 'gigantes' else 'a5e' end grupo
    from produtos_grupos
  ),
  vendas as (
    select public.assin_chave_tel(s.data->'buyer'->>'phone') k,
           lower(nullif(s.data->'buyer'->>'email', '')) e,
           s.data->'product'->>'id' pid,
           s.status,
           s.paid_at,
           nullif(s.data->'refund'->>'refundedAt', '')::timestamptz reembolso_em,
           (s.data->>'contractId') is not null contrato,
           s.data->>'contractId' contrato_id
    from eduzz_sales_raw s
    where s.data->'product'->>'id' in (select pid from prods)
  ),
  assin as (
    select public.assin_chave_tel(a.dados->'client'->>'phone') k,
           lower(nullif(coalesce(a.email_comprador, a.dados->'client'->>'email'), '')) e,
           a.produto_eduzz_id pid, a.tipo, a.status_normalizado st, a.proximo_vencimento venc,
           a.id_assinatura_eduzz::text aid
    from assinaturas_eduzz a
    where a.produto_eduzz_id in (select pid from prods)
    union
    select public.assin_chave_tel(s.data->'buyer'->>'phone'),
           lower(nullif(s.data->'buyer'->>'email', '')),
           a.produto_eduzz_id, a.tipo, a.status_normalizado, a.proximo_vencimento,
           a.id_assinatura_eduzz::text
    from assinaturas_eduzz a
    join eduzz_sales_raw s on s.data->>'contractId' = a.id_assinatura_eduzz::text
    where a.produto_eduzz_id in (select pid from prods)
  ),
  tmb as (
    select public.assin_chave_tel(t.data::jsonb->>'telefone') k,
           lower(nullif(t.email, '')) e,
           t.produto_id::text pid,
           case t.produto_id::text when '28284' then 'a5e' when '30220' then 'gigantes' when '27029' then 'ambos' end grupo,
           t.status_pedido sp, t.status_financeiro sf,
           t.data_efetivado::timestamptz efet,
           (select max(en.cancelado_em) from tmb_entregas en where en.pedido_id = t.pedido_id::text) cancelado_em
    from tmb_pedidos_raw t
    where t.produto_id::text in ('28284', '30220', '27029')
  ),
  asaas as (
    select public.assin_chave_tel(c.celular) k,
           lower(nullif(c.email, '')) e,
           case when cb.descricao ~* 'gigantes' then 'gigantes'
                when cb.descricao ~* '(anfitri|a5e)' then 'a5e'
                else 'ambos' end grupo,
           cb.payment_date::timestamptz pago
    from asaas_cobrancas cb
    join asaas_clientes c on c.id = cb.cliente_id
    where cb.status in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
      and cb.payment_date >= current_date - 365
      and coalesce(cb.descricao, '') !~* '(mentoria|publi|patroc)'
      and (coalesce(cb.descricao, '') = '' or cb.descricao ~* '(anfitri|a5e|gigantes|black|cadeira|renova)')
  ),
  mail as (
    select ord, email e from itens where email is not null
    union
    select i.ord, x.e
    from itens i
    join (select k, e from vendas union select k, e from assin
          union select k, e from tmb union select k, e from asaas) x on x.k = i.chave
    where x.e is not null
  ),
  v as (
    select i.ord, vd.pid, vd.status, vd.paid_at, vd.reembolso_em, vd.contrato, vd.contrato_id
    from itens i join prods p on p.grupo = i.grupo join vendas vd on vd.pid = p.pid and vd.k = i.chave
    union
    select i.ord, vd.pid, vd.status, vd.paid_at, vd.reembolso_em, vd.contrato, vd.contrato_id
    from itens i join prods p on p.grupo = i.grupo join mail m on m.ord = i.ord
    join vendas vd on vd.pid = p.pid and vd.e = m.e
  ),
  -- Upgrade (Fernando, 19/11): no grupo do A5E, a assinatura do Gigantes ativa
  -- (ou atrasada, dentro da tolerância de 7 dias) conta como a do A5E.
  a as (
    select i.ord, s.tipo, s.st, s.venc, s.aid, false via_gig
    from itens i join prods p on p.grupo = i.grupo join assin s on s.pid = p.pid and s.k = i.chave
    union
    select i.ord, s.tipo, s.st, s.venc, s.aid, false
    from itens i join prods p on p.grupo = i.grupo join mail m on m.ord = i.ord
    join assin s on s.pid = p.pid and s.e = m.e
    union
    select i.ord, s.tipo, s.st, s.venc, s.aid, true
    from itens i join prods p on p.grupo = 'gigantes' join assin s on s.pid = p.pid and s.k = i.chave
    where i.grupo = 'a5e' and s.st in ('ativa', 'atrasada') and s.tipo is distinct from 'venda_unica'
    union
    select i.ord, s.tipo, s.st, s.venc, s.aid, true
    from itens i join prods p on p.grupo = 'gigantes' join mail m on m.ord = i.ord
    join assin s on s.pid = p.pid and s.e = m.e
    where i.grupo = 'a5e' and s.st in ('ativa', 'atrasada') and s.tipo is distinct from 'venda_unica'
  ),
  t as (
    select i.ord, x.pid, x.sp, x.sf, x.efet, x.cancelado_em
    from itens i join tmb x on x.grupo in (i.grupo, 'ambos') and x.k = i.chave
    union
    select i.ord, x.pid, x.sp, x.sf, x.efet, x.cancelado_em
    from itens i join mail m on m.ord = i.ord join tmb x on x.grupo in (i.grupo, 'ambos') and x.e = m.e
  ),
  s as (
    select i.ord, x.pago
    from itens i join asaas x on x.grupo in (i.grupo, 'ambos') and x.k = i.chave
    union
    select i.ord, x.pago
    from itens i join mail m on m.ord = i.ord join asaas x on x.grupo in (i.grupo, 'ambos') and x.e = m.e
  ),
  prot as (
    select i.ord, min(x.nome) nome, max(x.ate) ate
    from itens i
    join excecoes_grupo x on public.assin_chave_tel(x.telefone) = i.chave
    where x.ate is null or x.ate >= current_date
    group by i.ord
  ),
  agg as (
    select i.ord, i.telefone, i.chave, i.grupo,
      (select max(paid_at) from v where v.ord = i.ord and v.status = 'paid') ult_eduzz,
      (select max(paid_at) from v where v.ord = i.ord and v.status = 'paid' and not v.contrato
                                    and v.paid_at >= now() - interval '12 months') avulsa,
      -- Black Friday Histórica: 4 anos nos dois grupos (Eduzz e boleto da TMB).
      (select max(paid_at) from v where v.ord = i.ord and v.status = 'paid' and v.pid = '2914907'
                                    and v.paid_at >= now() - interval '4 years') black_eduzz,
      (select max(efet) from t where t.ord = i.ord and t.pid = '27029' and t.sp = 'Efetivado'
         and t.sf in ('Adimplente', 'Quitado') and t.efet >= now() - interval '4 years') black_tmb,
      (select max(coalesce(paid_at, reembolso_em)) from v where v.ord = i.ord and v.status = 'refunded'
                                                       and v.pid = '2914907') reemb_black_eduzz,
      (select max(efet) from t where t.ord = i.ord and t.pid = '27029' and t.sp = 'Cancelado') reemb_black_tmb,
      (select max(coalesce(reembolso_em, paid_at)) from v where v.ord = i.ord and v.status = 'refunded') reemb_eduzz,
      (select max(coalesce(paid_at, reembolso_em)) from v where v.ord = i.ord and v.status = 'refunded') reemb_compra_eduzz,
      (select max(venc) from a where a.ord = i.ord and a.st = 'ativa' and a.tipo is distinct from 'venda_unica') assin_ate,
      (select max(venc) from a where a.ord = i.ord and a.st = 'ativa' and a.tipo is distinct from 'venda_unica'
                                 and not a.via_gig) assin_ate_proprio,
      (select max(venc) from a where a.ord = i.ord and a.st = 'atrasada') atraso_venc,
      exists (select 1 from v join a on a.ord = v.ord and a.aid = v.contrato_id
              where v.ord = i.ord and v.status = 'refunded'
                and a.st = 'ativa' and a.tipo is distinct from 'venda_unica') reemb_da_ativa,
      (select bool_or(a.st = 'cancelada') from a where a.ord = i.ord) tem_cancelada,
      (select max(efet) from t where t.ord = i.ord and t.sp = 'Efetivado'
         and (t.sf = 'Adimplente' or (t.sf = 'Quitado' and t.efet >= now() - interval '12 months'))) tmb_ok,
      (select bool_or(t.sf = 'Inadimplente') from t where t.ord = i.ord) tmb_inad,
      (select max(coalesce(cancelado_em, efet)) from t where t.ord = i.ord and t.sp = 'Cancelado') tmb_cancel,
      (select max(efet) from t where t.ord = i.ord and t.sp = 'Cancelado') tmb_cancel_compra,
      (select max(pago) from s where s.ord = i.ord) asaas_ok,
      p.nome prot_nome, p.ate prot_ate,
      (exists (select 1 from v where v.ord = i.ord) or exists (select 1 from a where a.ord = i.ord)
        or exists (select 1 from t where t.ord = i.ord) or exists (select 1 from s where s.ord = i.ord)) tem_compra
    from itens i
    left join prot p on p.ord = i.ord
  ),
  dec as (
    select g.*,
      greatest(g.black_eduzz, g.black_tmb) black,
      greatest(g.ult_eduzz, g.tmb_ok, g.asaas_ok, g.black_tmb) ult_pag,
      greatest(g.reemb_eduzz, g.tmb_cancel) reemb,
      greatest(g.reemb_compra_eduzz, g.tmb_cancel_compra) reemb_compra,
      case when g.atraso_venc >= date '2026-11-18' then current_date - g.atraso_venc end dias_atraso,
      greatest(g.reemb_compra_eduzz, g.tmb_cancel_compra) is not null
        and greatest(g.reemb_compra_eduzz, g.tmb_cancel_compra)
            >= coalesce(greatest(g.ult_eduzz, g.tmb_ok, g.asaas_ok, g.black_tmb), '-infinity'::timestamptz)
        and (g.assin_ate is null or g.reemb_da_ativa)
        -- Com a Black paga, só o reembolso/cancelamento da própria Black tira.
        and (greatest(g.black_eduzz, g.black_tmb) is null
             or greatest(g.reemb_black_eduzz, g.reemb_black_tmb) >= greatest(g.black_eduzz, g.black_tmb)) reembolso_vale
    from agg g
  ),
  fim as (
    select d.*,
      case
        when d.prot_nome is not null then 'protegido'
        when d.reembolso_vale and d.reemb >= now() - interval '30 days' then 'sai_agora'
        when d.reembolso_vale then 'sai'
        when d.assin_ate is not null or d.black is not null or d.avulsa is not null
             or d.tmb_ok is not null or d.asaas_ok is not null then 'fica'
        when d.dias_atraso >= 7 then 'sai_agora'
        when d.dias_atraso is not null then 'fica'
        when d.tem_compra then 'sai'
        else 'nao_achei'
      end decisao,
      case
        when d.prot_nome is not null then 'protegido'
        when d.reembolso_vale then 'reembolso'
        when d.assin_ate is not null then 'assinatura_ativa'
        when d.black is not null then 'black_4_anos'
        when d.avulsa is not null then 'compra_eduzz_12m'
        when d.tmb_ok is not null then 'tmb'
        when d.asaas_ok is not null then 'asaas'
        when d.dias_atraso >= 7 then 'atraso_7_dias'
        when d.dias_atraso is not null then 'atraso_' || d.dias_atraso || '_dias'
        when d.atraso_venc is not null then 'assinatura_atrasada'
        when d.tem_cancelada then 'assinatura_cancelada'
        when d.tmb_inad then 'tmb_inadimplente'
        when d.tem_compra then 'venceu'
        else 'nao_achei'
      end motivo,
      case
        when d.prot_nome is not null then 'lista de proteção (' || d.prot_nome || ')'
        when d.reembolso_vale then 'eduzz/tmb'
        when d.assin_ate is not null and d.assin_ate_proprio is null then 'assinatura do Gigantes (upgrade)'
        when d.assin_ate is not null then 'assinatura Eduzz'
        when d.black is not null then 'Black Friday (4 anos)'
        when d.avulsa is not null then 'compra Eduzz fora de assinatura'
        when d.tmb_ok is not null then 'TMB'
        when d.asaas_ok is not null then 'Asaas'
        when d.tem_compra then 'eduzz/tmb/asaas'
      end fonte,
      case
        when d.prot_nome is not null then d.prot_ate
        else greatest(d.assin_ate, (d.black + interval '4 years')::date,
                      (d.avulsa + interval '12 months')::date, (d.asaas_ok + interval '12 months')::date)
      end valido_ate
    from dec d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'telefone', f.telefone,
           'grupo', f.grupo,
           'decisao', f.decisao,
           'motivo', f.motivo,
           'fonte', f.fonte,
           'ultimo_pagamento', f.ult_pag::date,
           'reembolso_em', case when f.motivo = 'reembolso' then f.reemb::date end,
           'valido_ate', f.valido_ate,
           'dias_atraso', f.dias_atraso,
           'decisao_anterior', u.decisao,
           'mudou', u.decisao is not null and u.decisao <> f.decisao,
           'mudou_em', case when u.decisao is not null and u.decisao <> f.decisao then now() else u.mudou_em end
         ) order by f.ord), '[]'::jsonb)
    into v
  from fim f
  left join foley_situacao_ultima u on u.chave = f.chave and u.grupo = f.grupo;

  insert into foley_situacao_ultima (chave, grupo, decisao, motivo, mudou_em, visto_em)
  select distinct on (public.assin_chave_tel(x->>'telefone'), x->>'grupo')
         public.assin_chave_tel(x->>'telefone'), x->>'grupo', x->>'decisao', x->>'motivo', now(), now()
  from jsonb_array_elements(v) x
  where public.assin_chave_tel(x->>'telefone') is not null
  on conflict (chave, grupo) do update
    set motivo = excluded.motivo,
        visto_em = now(),
        mudou_em = case when foley_situacao_ultima.decisao <> excluded.decisao then now() else foley_situacao_ultima.mudou_em end,
        decisao = excluded.decisao;

  return v;
end;
$function$;

revoke all on function public.foley_situacao_regra(jsonb) from public, anon, authenticated;
