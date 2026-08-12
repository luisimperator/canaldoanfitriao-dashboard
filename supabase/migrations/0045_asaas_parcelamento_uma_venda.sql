-- Vendas por vendedor: um parcelamento do Asaas é UMA venda, pelo valor cheio,
-- na data em que o negócio realmente fechou.
--
-- O problema: o Asaas trata parcelamento diferente conforme a forma de
-- pagamento, e o casamento copiava essa diferença pro dashboard.
--
--   Cartão  → aprovou, TODAS as parcelas viram CONFIRMED na hora
--             → a venda inteira caía no mês (Fabiana: R$ 12.615 de uma vez)
--   Boleto  → só a parcela paga vira RECEIVED, as futuras ficam PENDING
--             → pingava parcela a parcela (Elizabeth: R$ 2.000 de R$ 22.000)
--
-- Resultado: quem vendia no cartão parecia maior que quem vendia no boleto,
-- mesmo vendendo mais. E R$ 34.000 de mentoria já contratada não apareciam em
-- lugar nenhum do gráfico.
--
-- A regra agora: o plano inteiro credita pro vendedor de uma vez, numa linha só
-- em `sales` — ancorada na primeira parcela; as seguintes não geram linha.
--
-- E a data é a do PRIMEIRO PAGAMENTO no Asaas, não a da criação do plano. Isso
-- é regra de negócio da Mentoria: a compra na Eduzz é só uma pré-reserva pra
-- entrar no processo seletivo — quem paga a Eduzz ainda pode não virar aluno.
-- O fechamento acontece quando a pessoa paga a primeira parcela no Asaas. É
-- esse pagamento que marca a venda, e é a data dele que vale pro vendedor.
--
-- No arranjo "entrada + 10x" que o comercial usa, a entrada é uma cobrança
-- solta (fora do plano) — ela conta como esse primeiro pagamento quando foi
-- criada junto do plano (mesma semana, mesmo cliente).
--
-- Cai de graça a trava contra venda fantasma: sem primeiro pagamento não há
-- data, e sem data o plano não vira venda. Boleto gerado e nunca pago não
-- infla o gráfico de ninguém.
--
-- O que NÃO muda: caixa e provisão continuam por data de crédito, lendo o
-- Asaas direto; a política de distribuição lê eduzz_sales_raw. Nenhum dos dois
-- passa por aqui — dinheiro contratado não vira dinheiro disponível.

create or replace function public.casar_asaas_com_vendas(p_dias integer default 90)
 returns table(cobranca text, cliente text, valor numeric, vendedor text, criterio text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  return query
  with
  -- Todo pagamento efetivo, com a data em que aconteceu.
  pagamentos as (
    select c.cliente_id,
           c.raw->>'installment' as plano_id,
           (c.raw->>'dateCreated')::date as criada_em,
           asaas_data_venda(c.confirmed_date, c.payment_date) as pago_em
    from asaas_cobrancas c
    where c.status in ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')
      and asaas_data_venda(c.confirmed_date, c.payment_date) is not null
  ),
  planos as (
    select c.raw->>'installment' as plano_id,
           min(c.cliente_id) as cliente_id,
           sum(c.valor) as total,
           count(*)::int as parcelas,
           min((c.raw->>'dateCreated')::date) as criado_em,
           (array_agg(c.id order by coalesce((c.raw->>'installmentNumber')::int, 9999),
                                    c.due_date))[1] as ancora,
           (array_agg(c.descricao order by coalesce((c.raw->>'installmentNumber')::int, 9999),
                                           c.due_date))[1] as descricao
    from asaas_cobrancas c
    where c.raw->>'installment' is not null
    group by 1
  ),
  planos_reais as (
    select p.plano_id, p.cliente_id, p.total, p.parcelas, p.ancora, p.descricao,
           -- O primeiro pagamento é a venda: prova que fechou e dá a data.
           (select min(g.pago_em) from pagamentos g
             where g.plano_id = p.plano_id
                or (g.plano_id is null
                    and g.cliente_id = p.cliente_id
                    and abs(g.criada_em - p.criado_em) <= 7)
           ) as data_venda
    from planos p
  ),
  -- Cobrança solta segue como antes: vira venda quando é paga.
  avulsas as (
    select c.id as ancora, c.cliente_id, c.valor as total, 1 as parcelas,
           asaas_data_venda(c.confirmed_date, c.payment_date) as data_venda,
           c.descricao
    from asaas_cobrancas c
    where c.raw->>'installment' is null
      and c.status in ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')
      and asaas_data_venda(c.confirmed_date, c.payment_date) is not null
  ),
  candidatos as (
    select ancora, cliente_id, total, parcelas, data_venda, descricao from planos_reais
    union all
    select ancora, cliente_id, total, parcelas, data_venda, descricao from avulsas
  ),
  pendentes as (
    select k.*, cl.nome, cl.email, cl.documento
    from candidatos k
    join asaas_clientes cl on cl.id = k.cliente_id
    where k.data_venda is not null
      and not exists (select 1 from sales s where s.asaas_payment_id = k.ancora)
  ),
  casado as (
    select distinct on (p.ancora)
      p.ancora as cobranca_id, p.nome as cliente_nome, p.total as valor, p.data_venda,
      p.descricao, p.parcelas, s.seller_id, s.product,
      case
        when p.email is not null and lower(s.buyer_email) = lower(p.email) then 'e-mail'
        when p.documento is not null and s.buyer_document = p.documento then 'documento'
        else 'nome'
      end as criterio
    from pendentes p
    join sales s
      on s.sale_date between p.data_venda - p_dias and p.data_venda
     and s.seller_id is not null
     and s.fonte = 'eduzz'
     and (
       (p.email is not null and lower(s.buyer_email) = lower(p.email))
       or (p.documento is not null and s.buyer_document = p.documento)
       or (p.nome is not null and nome_chave(s.buyer_name) = nome_chave(p.nome))
     )
    order by p.ancora, s.sale_date desc
  ),
  inserido as (
    insert into sales (sale_date, amount, product, status, seller_id,
                       buyer_name, fonte, asaas_payment_id)
    select c.data_venda, c.valor,
           -- "Mentoria Alfaiate - Parcela 1 de 10." vira "Mentoria Alfaiate (10x)":
           -- a linha representa o plano inteiro, não a parcela.
           coalesce(
             nullif(trim(both ' -–.' from regexp_replace(
               coalesce(nullif(trim(c.descricao), ''), ''),
               'Parcela\s+\d+\s+de\s+\d+\.?', '', 'gi')), ''),
             regexp_replace(c.product, '\s*\(Entrada\)\s*$', '', 'i') || ' (saldo Asaas)'
           ) || case when c.parcelas > 1 then ' (' || c.parcelas || 'x)' else '' end,
           'paga', c.seller_id, c.cliente_nome, 'asaas', c.cobranca_id
    from casado c
    on conflict (asaas_payment_id) where asaas_payment_id is not null do nothing
    returning asaas_payment_id, seller_id, amount, buyer_name
  )
  select i.asaas_payment_id, i.buyer_name, i.amount, sel.name, c.criterio
  from inserido i
  join casado c on c.cobranca_id = i.asaas_payment_id
  left join sellers sel on sel.id = i.seller_id;
end;$function$;

-- Recrava o histórico: derruba as linhas que eram parcela solta e deixa a
-- função reconstruir uma linha por plano, com valor cheio e data de fechamento.
delete from sales s
where s.fonte = 'asaas'
  and exists (
    select 1 from asaas_cobrancas c
    where c.id = s.asaas_payment_id and c.raw->>'installment' is not null
  );

select public.casar_asaas_com_vendas(365);
