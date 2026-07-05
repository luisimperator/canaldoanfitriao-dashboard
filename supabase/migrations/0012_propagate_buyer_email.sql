-- O e-mail do comprador SEMPRE existe no raw da Eduzz (14,7 mil vendas desde
-- 2021, 100% com e-mail), mas a tabela sales só ganhava buyer_email pelas
-- vendas novas do webhook — o histórico importado ficou sem, cegando qualquer
-- análise de cohort (ex.: cohort sad-jan-2026 parecia ter 15 compradores;
-- eram 335, R$ 334 mil).

-- Backfill: copia buyer_* do raw pra toda venda sem e-mail.
update public.sales s
set buyer_email = lower(r.data->'buyer'->>'email'),
    buyer_name = coalesce(s.buyer_name, r.data->'buyer'->>'name'),
    buyer_document = coalesce(s.buyer_document, r.data->'buyer'->>'document')
from public.eduzz_sales_raw r
where s.eduzz_invoice_id = r.id
  and (s.buyer_email is null or s.buyer_email = '')
  and r.data->'buyer'->>'email' is not null;

-- Daqui pra frente: todo insert/update no raw propaga buyer_* pra sales,
-- não importa por onde a venda entrou (webhook, sync, import manual).
create or replace function public.propagate_buyer_from_raw()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.sales s
  set buyer_email = coalesce(nullif(s.buyer_email,''), lower(new.data->'buyer'->>'email')),
      buyer_name = coalesce(s.buyer_name, new.data->'buyer'->>'name'),
      buyer_document = coalesce(s.buyer_document, new.data->'buyer'->>'document')
  where s.eduzz_invoice_id = new.id
    and (s.buyer_email is null or s.buyer_email = '');
  return new;
end;$$;

drop trigger if exists trg_propagate_buyer on public.eduzz_sales_raw;
create trigger trg_propagate_buyer
  after insert or update on public.eduzz_sales_raw
  for each row execute function public.propagate_buyer_from_raw();
