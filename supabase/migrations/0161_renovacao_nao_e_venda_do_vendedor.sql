-- Renovação de assinatura não é venda do vendedor (Fernando, 28/11: "Não
-- coloca no painel dos vendedores como venda o que for renovação de
-- assinatura, ok? Tipo. Caiu um 997 com o utm do Diego. O Diego nem tá mais
-- na empresa").
--
-- Toda assinatura da Eduzz aqui é anual: qualquer cobrança depois da primeira
-- do mesmo contrato é renovação. A renovação chega com a UTM da venda
-- original (ex.: "diego" de 2025) e, sem vendedor no link, o webhook caía no
-- dono do lead no CRM — e a renovação ia pra conta de alguém.
--
--   • venda_eh_renovacao(fatura, contrato, dia): a fatura é de um contrato
--     cuja primeira fatura é outra (assinaturas_eduzz.id_primeira_fatura); sem
--     a assinatura sincronizada ainda, vale ter outra fatura paga do mesmo
--     contrato mais de 180 dias antes.
--   • vendas_do_time (Vendido pelo time) deixa a renovação de fora.
--   • As renovações já gravadas com vendedor perdem o vendedor (a lista do
--     que mudou fica em webhook_log, source 'claude'). O webhook passa a não
--     dar vendedor pra renovação (src/app/api/webhooks/eduzz/route.ts).

create index if not exists eduzz_sales_raw_contrato_idx
  on public.eduzz_sales_raw ((data->>'contractId'));

create or replace function public.venda_eh_renovacao(
  p_fatura text,
  p_contrato text default null,
  p_dia date default null
)
returns boolean
language sql
stable security definer
set search_path = public
as $function$
  with c as (
    select coalesce(nullif(p_contrato, ''),
                    (select r.data->>'contractId' from eduzz_sales_raw r where r.id = p_fatura)) as contrato,
           coalesce(p_dia,
                    (select ((r.data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date
                       from eduzz_sales_raw r where r.id = p_fatura),
                    (now() at time zone 'America/Sao_Paulo')::date) as dia
  ),
  a as (
    select a.id_primeira_fatura
    from assinaturas_eduzz a, c
    where a.id_assinatura_eduzz = c.contrato
    limit 1
  )
  select case
    when (select contrato from c) is null or p_fatura is null then false
    when exists (select 1 from a where a.id_primeira_fatura is not null)
      then (select a.id_primeira_fatura from a) <> p_fatura
    else exists (
      select 1 from eduzz_sales_raw x, c
      where x.data->>'contractId' = c.contrato
        and x.id <> p_fatura
        and x.status = 'paid'
        and ((x.data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date < c.dia - 180
    )
  end;
$function$;

revoke all on function public.venda_eh_renovacao(text, text, date) from public, anon, authenticated;
grant execute on function public.venda_eh_renovacao(text, text, date) to service_role;

CREATE OR REPLACE FUNCTION public.vendas_do_time(p_de date, p_ate date)
 RETURNS TABLE(venda_id text, origem text, dia date, valor numeric, produto text, vendedor text, canal text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with sel as (
    select s.name,
           lower(translate(split_part(s.name, ' ', 1), 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeiooooucAAAAEEIOOOOUC')) slug
      from public.sellers s
  ),
  ed as (
    select 'sales:' || s.id::text venda_id, case when s.fonte = 'asaas' then 'Asaas' else 'Eduzz' end origem,
           s.sale_date::date dia, coalesce(s.preco, s.amount)::numeric valor, s.product produto, s.created_at quando,
           coalesce(se.name, case when lower(coalesce(s.utm->>'source', '')) = 'teo' then 'Téo' end) dono_link
      from public.sales s
      left join public.sellers se on se.id = s.seller_id
     where s.status = 'paga' and s.sale_date between p_de and p_ate
       -- renovação de assinatura não é venda de ninguém (Fernando, 28/11)
       and not (s.eduzz_invoice_id is not null and coalesce(s.fonte, 'eduzz') <> 'asaas'
                and public.venda_eh_renovacao(s.eduzz_invoice_id, null, s.sale_date))
  ),
  tm as (
    select 'tmb:' || p.pedido_id::text, 'TMB', p.data_efetivado::date, p.valor_total, p.lancamento,
           coalesce(p.criado_em, p.updated_at),
           case when u.slug = 'teo' then 'Téo' else (select sel.name from sel where sel.slug = u.slug limit 1) end
      from public.tmb_pedidos_raw p
      cross join lateral (select lower(coalesce(nullif(p.data->>'utm_source', ''), nullif(p.data->>'utm_last_source', ''), '')) slug) u
     where p.status_pedido = 'Efetivado' and p.data_efetivado::date between p_de and p_ate
  ),
  todas as (select * from ed union all select * from tm),
  calls as (
    select c.vendedor, c.venda_origem, c.venda_em, c.venda_valor
      from public.painel_calls(((p_de - 7)::timestamp at time zone 'America/Sao_Paulo'),
                               ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')) c
     where c.venda_valor is not null and c.vendedor is not null
  )
  select t.venda_id, t.origem, t.dia, t.valor, t.produto,
         coalesce(t.dono_link, k.vendedor) vendedor,
         case when t.dono_link is not null and k.vendedor is not null then 'link+call'
              when t.dono_link is not null then 'link' else 'call' end canal
    from todas t
    left join lateral (
      select c.vendedor from calls c
       where c.venda_origem = t.origem and round(c.venda_valor) = round(t.valor)
         and (c.venda_em = t.quando or (c.venda_em at time zone 'America/Sao_Paulo')::date = t.dia)
       order by (c.venda_em = t.quando) desc
       limit 1
    ) k on true
   where coalesce(t.dono_link, k.vendedor) is not null;
$function$;

-- Renovações já gravadas com vendedor: guarda quem era e tira o vendedor.
with alvo as (
  select s.id, s.sale_date, coalesce(s.preco, s.amount) valor, s.product, s.seller_id,
         (select name from sellers where id = s.seller_id) vendedor, s.utm->>'source' utm
  from sales s
  where s.seller_id is not null
    and s.eduzz_invoice_id is not null
    and coalesce(s.fonte, 'eduzz') <> 'asaas'
    and public.venda_eh_renovacao(s.eduzz_invoice_id, null, s.sale_date)
),
log as (
  insert into webhook_log (source, note, body)
  select 'claude', 'renovação sem vendedor (0161)',
         jsonb_build_object('vendas', jsonb_agg(to_jsonb(alvo) order by alvo.sale_date))
  from alvo
  having count(*) > 0
  returning 1
)
update sales s set seller_id = null
from alvo
where s.id = alvo.id;
