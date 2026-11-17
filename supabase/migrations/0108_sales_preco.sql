-- Preço do produto na venda, sem os juros do parcelamento (Fernando, 16/11:
-- "juros não vem pra mim"). amount continua sendo o valor pago (com juros),
-- como no histórico importado dos CSVs; preco é o price.value da fatura da
-- Eduzz (já com cupom). Venda sem preco (CSV antigo, Asaas) usa amount.
alter table public.sales add column if not exists preco numeric;

-- Preenche as vendas que já chegaram pelo webhook (fatura paga no webhook_log).
update public.sales s
   set preco = (w.body -> 'data' -> 'price' ->> 'value')::numeric
  from public.webhook_log w
 where w.source = 'eduzz'
   and w.note = 'myeduzz.invoice_paid'
   and w.body -> 'data' ->> 'id' = s.eduzz_invoice_id
   and (w.body -> 'data' -> 'price' ->> 'value') ~ '^[0-9]+(\.[0-9]+)?$'
   and s.preco is null;
