-- Renovação = outra fatura do contrato, a pelo menos 180 dias do início da
-- assinatura. Sem essa trava, duas faturas do mesmo contrato no mesmo dia
-- (cobrança repetida, segundo cartão) viravam "renovação" (24/11, Flávio).
-- Quem a 0161 tirou e não é renovação pela regra nova volta a ter o vendedor
-- (lista em webhook_log, source 'claude', 'renovação: vendedor devolvido').

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
    select a.id_primeira_fatura, a.inicio
    from assinaturas_eduzz a, c
    where a.id_assinatura_eduzz = c.contrato
    limit 1
  )
  select case
    when (select contrato from c) is null or p_fatura is null then false
    when exists (select 1 from a where a.id_primeira_fatura is not null)
      then (select a.id_primeira_fatura <> p_fatura
                   and (a.inicio is null or (select dia from c) - a.inicio >= 180) from a)
    else exists (
      select 1 from eduzz_sales_raw x, c
      where x.data->>'contractId' = c.contrato
        and x.id <> p_fatura
        and x.status = 'paid'
        and ((x.data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date < c.dia - 180
    )
  end;
$function$;

with tirados as (
  select (v->>'id')::uuid id, (v->>'seller_id')::uuid seller_id
  from webhook_log w, jsonb_array_elements(w.body->'vendas') v
  where w.source = 'claude' and w.note = 'renovação sem vendedor (0161)'
),
volta as (
  select t.id, t.seller_id
  from tirados t join sales s on s.id = t.id
  where s.seller_id is null
    and not public.venda_eh_renovacao(s.eduzz_invoice_id, null, s.sale_date)
),
log as (
  insert into webhook_log (source, note, body)
  select 'claude', 'renovação: vendedor devolvido (0162)', jsonb_build_object('vendas', jsonb_agg(to_jsonb(volta)))
  from volta having count(*) > 0
  returning 1
)
update sales s set seller_id = volta.seller_id
from volta
where s.id = volta.id;
