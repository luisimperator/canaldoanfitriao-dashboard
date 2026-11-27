-- Black Friday na aba Assinaturas (Fernando, 27/11: "as assinaturas da black
-- estão corretas? ano passado foi uns 100 e depois foram mais esse ano. To
-- achando pouco. E precisa estar registrado que quem comprou tem 4 anos de
-- comunidade").
--
-- A aba mostrava 114 Black ativas porque:
-- 1) assin_sync_black() (que copia as vendas da Black da Eduzz pra
--    assinaturas_eduzz) só tinha rodado à mão, em 15/11: as vendas de 2026
--    depois disso não entravam. Agora roda de hora em hora;
-- 2) o boleto da Black na TMB (produto 27029) não entrava. Agora entra na
--    mesma linha "Black Friday".
-- Em 27/11: Eduzz 82 pagas em 2025 + 41 em 2026; TMB 19 em 2025 + 12 em 2026.
--
-- A regra (0102 e 0156): a Black Friday Histórica (2025 e 2026) dá 4 anos de
-- comunidade, nos dois grupos (A5E e Gigantes), contados do pagamento
-- (Eduzz) ou do pedido efetivado (TMB). O vencimento de cada compra na aba é
-- essa data (pagamento + 4 anos).

comment on function public.assin_sync_black() is
  'Copia as vendas pagas da Black Friday Histórica (Eduzz 2914907) pra assinaturas_eduzz como venda_unica, com vencimento = pagamento + 4 anos (4 anos de comunidade nos dois grupos, A5E e Gigantes). Roda de hora em hora (cron assin-sync-black, 0157).';

select cron.unschedule(jobid) from cron.job where jobname = 'assin-sync-black';
select cron.schedule('assin-sync-black', '50 * * * *', $$ select public.assin_sync_black() $$);

create or replace function public.assin_painel_linhas()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with pagos as (
    select s.data->>'contractId' as contrato,
           count(*) as faturas,
           sum((s.data->'total'->>'value')::numeric) as pago
    from eduzz_sales_raw s
    where s.status = 'paid' and s.data->>'contractId' is not null
    group by 1
  ),
  ltv as (
    select lower(s.email) as email, sum((s.data->'total'->>'value')::numeric) as ltv
    from eduzz_sales_raw s
    where s.status = 'paid' and s.email is not null
    group by 1
  ),
  base_eduzz as (
    select a.id_assinatura_eduzz,
           a.tipo,
           a.produto_eduzz_id,
           a.produto,
           a.status,
           a.status_normalizado,
           a.inicio,
           a.proximo_vencimento,
           a.valor,
           lower(a.email_comprador) as email,
           a.dados->'client'->>'name' as nome,
           case when coalesce(a.dados->'client'->'phone'->>'number', '') <> '' then
             '+' || coalesce(a.dados->'client'->'phone'->>'countryCode', '') || coalesce(a.dados->'client'->'phone'->>'areaCode', '') || (a.dados->'client'->'phone'->>'number')
           end as telefone,
           case
             when a.produto_eduzz_id in ('1702138', '1783828', '1760209', '2626179', '1760222', '2811180') then 'A5E'
             when a.produto_eduzz_id in ('2297739', '2837267') then 'Gigantes'
             when a.produto_eduzz_id = '3152952' then 'Max'
             when a.produto_eduzz_id = '2914907' then 'Black Friday'
             else coalesce(a.produto, a.produto_eduzz_id)
           end as linha,
           -- saída = quando cancelou/suspendeu na Eduzz; acesso_ate = quando a
           -- Eduzz tira (ou tirou) o acesso (pode ser no futuro: pagou até lá).
           case when jsonb_typeof(a.dados->'interruption') = 'object' then
             (coalesce(a.dados->'interruption'->>'createdAt', a.dados->'interruption'->>'removeAccessDate')::timestamptz at time zone 'America/Sao_Paulo')::date
           end as saida,
           case when jsonb_typeof(a.dados->'interruption') = 'object' then
             ((a.dados->'interruption'->>'removeAccessDate')::timestamptz at time zone 'America/Sao_Paulo')::date
           end as acesso_ate,
           a.dados->'interruption'->>'reason' as motivo_saida,
           case when a.tipo = 'venda_unica' then (case when a.status = 'paid' then 1 else 0 end) else coalesce(p.faturas, 0) end as faturas_pagas,
           case when a.tipo = 'venda_unica' then (case when a.status = 'paid' then coalesce(a.valor, 0) else 0 end) else coalesce(p.pago, 0) end as pago
    from assinaturas_eduzz a
    left join pagos p on p.contrato = a.id_assinatura_eduzz
  ),
  -- Boleto da Black na TMB (produto 27029, 27/11): mesma linha "Black Friday",
  -- 4 anos a partir do pedido efetivado. Parcelado: o total entra em "pago" só
  -- quando quita (antes, só a entrada); a TMB não informa as parcelas pagas.
  base_tmb as (
    select 'tmb:' || t.pedido_id::text as id_assinatura_eduzz,
           'venda_unica'::text as tipo,
           '27029'::text as produto_eduzz_id,
           'Black Friday Histórica (boleto TMB)'::text as produto,
           t.status_financeiro as status,
           case
             when t.status_financeiro = 'Inadimplente' then 'atrasada'
             when t.status_financeiro in ('Adimplente', 'Quitado')
                  and (t.data_efetivado + interval '4 years')::date >= current_date then 'ativa'
             when t.status_financeiro in ('Adimplente', 'Quitado') then 'expirada'
             else 'cancelada'
           end as status_normalizado,
           t.data_efetivado::date as inicio,
           (t.data_efetivado + interval '4 years')::date as proximo_vencimento,
           t.valor_total as valor,
           lower(nullif(t.email, '')) as email,
           t.cliente as nome,
           null::text as telefone,
           'Black Friday'::text as linha,
           null::date as saida,
           null::date as acesso_ate,
           null::text as motivo_saida,
           case when t.status_financeiro = 'Quitado' then 1 else 0 end::bigint as faturas_pagas,
           case when t.status_financeiro = 'Quitado' then coalesce(t.valor_total, 0) else coalesce(t.valor_entrada, 0) end::numeric as pago
    from tmb_pedidos_raw t
    where t.produto_id::text = '27029' and t.status_pedido = 'Efetivado'
  ),
  base as (
    select * from base_eduzz
    union all
    select * from base_tmb
  ),
  ativos as (
    -- e-mail x linha com alguma assinatura ativa ou atrasada hoje
    select distinct email, linha from base where status_normalizado in ('ativa', 'atrasada') and email is not null
    union
    select distinct email, l from base, unnest(array['A5E', 'Gigantes']) l
    where linha = 'Black Friday' and status_normalizado = 'ativa' and email is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id_assinatura_eduzz,
           'tipo', b.tipo,
           'produto_id', b.produto_eduzz_id,
           'produto', b.produto,
           'linha', b.linha,
           'status', b.status,
           'situacao', b.status_normalizado,
           'inicio', b.inicio,
           'vencimento', b.proximo_vencimento,
           'valor', b.valor,
           'email', b.email,
           'nome', b.nome,
           'telefone', b.telefone,
           'saida', b.saida,
           'acesso_ate', b.acesso_ate,
           'motivo_saida', b.motivo_saida,
           'faturas_pagas', b.faturas_pagas,
           'pago', b.pago,
           'ltv_aluno', coalesce(l.ltv, 0),
           'voltou', (b.status_normalizado in ('cancelada', 'reembolsada', 'expirada')
                      and exists (select 1 from ativos x where x.email = b.email and x.linha = b.linha))
         ) order by b.inicio desc nulls last), '[]'::jsonb)
  from base b
  left join ltv l on l.email = b.email;
$$;

revoke all on function public.assin_painel_linhas() from public, anon, authenticated;
grant execute on function public.assin_painel_linhas() to service_role;

select public.assin_sync_black();
