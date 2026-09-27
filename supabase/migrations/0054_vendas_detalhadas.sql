-- Vendas uma a uma, das duas plataformas, pro "dia a dia" da tela de Vendas.
--
-- A tela usava só a tabela `sales`, que é Eduzz. Boleto parcelado da TMB não
-- aparecia, e não havia visão por dia: no lançamento do A5E (24/09/2026) a
-- pergunta "quantas vendas desde que abriu o carrinho, e por onde?" não tinha
-- resposta no painel.
--
-- Uma linha por venda:
--   Eduzz  — status paid (e refunded, marcada como estornada), pela data do
--            pagamento. Mesma pessoa pagando o mesmo produto em duas partes
--            no mesmo dia (ex.: R$ 500 no Pix + R$ 1.497 no cartão) conta
--            como UMA venda; junta pelo nome, porque o e-mail às vezes vem
--            digitado diferente entre as duas cobranças.
--   TMB    — pedidos Efetivados, pela data de criação. valor_total é o valor
--            do pedido (entrada + parcelas).

create or replace function public.vendas_detalhadas(p_de date, p_ate date)
returns table (
  dia date,
  hora text,
  plataforma text,
  produto text,
  cliente text,
  email text,
  metodo text,
  parcelas int,
  valor numeric,
  estornada boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ed as (
    select
      ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo') as quando,
      regexp_replace(coalesce(data->'product'->>'name', '—'), '^Curso:\s*', '') as produto,
      coalesce(data->'buyer'->>'name', '—') as cliente,
      lower(coalesce(data->'buyer'->>'email', email)) as email,
      coalesce(data->>'paymentMethod', '—') as metodo,
      nullif(data->>'installments', '')::int as parcelas,
      (data->'total'->>'value')::numeric as valor,
      status = 'refunded' as estornada
    from eduzz_sales_raw
    where status in ('paid', 'refunded')
      and (data->>'paidAt') is not null
      and ((data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  ed_venda as (
    select
      quando::date as dia,
      to_char(min(quando), 'HH24:MI') as hora,
      'Eduzz'::text as plataforma,
      produto,
      min(cliente) as cliente,
      min(email) as email,
      string_agg(distinct metodo, ' + ') as metodo,
      max(parcelas) as parcelas,
      sum(valor) as valor,
      bool_and(estornada) as estornada
    from ed
    group by quando::date, produto, lower(cliente), estornada
  ),
  tmb as (
    select
      (criado_em at time zone 'America/Sao_Paulo')::date as dia,
      to_char(criado_em at time zone 'America/Sao_Paulo', 'HH24:MI') as hora,
      'TMB'::text as plataforma,
      coalesce(lancamento, '—') as produto,
      coalesce(trim(cliente), '—') as cliente,
      lower(email) as email,
      'boleto TMB'::text as metodo,
      parcelas,
      valor_total as valor,
      false as estornada
    from tmb_pedidos_raw
    where status_pedido = 'Efetivado'
      and (criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  )
  select * from ed_venda
  union all
  select * from tmb
  order by 1, 2;
$$;

revoke all on function public.vendas_detalhadas(date, date) from public, anon, authenticated;
grant execute on function public.vendas_detalhadas(date, date) to service_role;
