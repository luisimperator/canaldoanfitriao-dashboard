-- Guarda a identidade do comprador em cada venda (vinda do webhook da Eduzz),
-- necessária para calcular LTV / recompra. O histórico antigo foi importado
-- sem esses campos; daqui pra frente o webhook preenche.
alter table public.sales
  add column if not exists buyer_email text,
  add column if not exists buyer_document text,
  add column if not exists buyer_name text;

create index if not exists sales_buyer_email_idx on public.sales (lower(buyer_email));
