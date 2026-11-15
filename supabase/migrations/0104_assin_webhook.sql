-- Assinantes etapa 2: webhook da Eduzz atualizando a cópia na hora.
--
-- 1. webhook_log ganha evento_id (o "id" que a Eduzz manda no topo de cada
--    evento). O índice único impede gravar o mesmo evento duas vezes; a rota
--    só reprocessa um repetido se a primeira vez não terminou (processado_em
--    vazio). As linhas antigas ficam sem evento_id.
-- 2. assin_webhook_eduzz(body): contrato criado/atualizado (e as tentativas de
--    cobrança, que trazem o status do contrato) gravam a assinatura no mesmo
--    formato da API; fatura da Black (venda única) paga, reembolsada,
--    chargeback ou cancelada atualiza a venda. Depois da primeira importação
--    gravada, liga a pessoa e o contato na hora.

alter table public.webhook_log add column if not exists evento_id text;
create unique index if not exists webhook_log_evento_uq on public.webhook_log (source, evento_id) where evento_id is not null;

create or replace function public.assin_webhook_eduzz(p_body jsonb)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ev text := p_body->>'event';
  d jsonb := p_body->'data';
  v_id text;
  v_primeira text;
  v_item jsonb;
  v_acao text := 'ignorado';
begin
  if v_ev like 'myeduzz.contract_%' and d ? 'contract' then
    v_id := d->'contract'->>'id';
    if v_id is null then return 'contrato sem id'; end if;
    select id_primeira_fatura into v_primeira from public.assinaturas_eduzz where id_assinatura_eduzz = v_id;
    -- Mesmo formato do item de /myeduzz/v1/subscriptions (client, products
    -- com title, payment.price, recurrence), pra reaproveitar a gravação.
    v_item := jsonb_build_object(
      'id', v_id,
      'status', d->'contract'->>'status',
      'client', jsonb_build_object('name', d->'customer'->>'name', 'email', d->'customer'->>'email', 'phone', d->'customer'->'phone'),
      'products', coalesce((select jsonb_agg(jsonb_build_object('id', p->>'id', 'title', p->>'name', 'membershipFee', p->'membershipFee'))
                            from jsonb_array_elements(coalesce(d->'products', '[]'::jsonb)) p), '[]'::jsonb),
      'recurrence', d->'contract'->'recurrence',
      'payment', jsonb_build_object('price', d->'contract'->'recurrence'->'price', 'method', d->'contract'->'payment'->>'method',
                                    'installments', d->'contract'->'payment'->'installments'),
      'contentAccess', d->'contract'->'contentAccess',
      'createdAt', d->'contract'->>'createdAt',
      'updatedAt', d->'contract'->>'updatedAt',
      'firstInvoiceId', v_primeira,
      'origem', 'webhook:' || v_ev);
    perform public.assin_gravar_item_eduzz(v_item);
    v_acao := 'assinatura ' || coalesce(d->'contract'->>'status', '?');

  elsif v_ev in ('myeduzz.invoice_paid', 'myeduzz.invoice_refunded', 'myeduzz.invoice_chargeback', 'myeduzz.invoice_canceled')
        and exists (select 1 from jsonb_array_elements(coalesce(d->'items', '[]'::jsonb)) i where i->>'productId' = '2914907') then
    v_id := d->>'id';
    if v_id is null then return 'fatura sem id'; end if;
    insert into public.assinaturas_eduzz (id_assinatura_eduzz, tipo, produto_eduzz_id, produto, status, status_normalizado,
      inicio, proximo_vencimento, valor, email_comprador, id_primeira_fatura, dados, sincronizado_em)
    values ('venda:' || v_id, 'venda_unica', '2914907',
      coalesce((select i->>'name' from jsonb_array_elements(d->'items') i where i->>'productId' = '2914907' limit 1), 'Black Friday Histórica'),
      case v_ev when 'myeduzz.invoice_paid' then 'paid' when 'myeduzz.invoice_refunded' then 'refunded'
                when 'myeduzz.invoice_chargeback' then 'chargeback' else 'canceled' end,
      case v_ev when 'myeduzz.invoice_paid' then 'ativa' when 'myeduzz.invoice_canceled' then 'cancelada' else 'reembolsada' end,
      nullif(d->>'paidAt', '')::date,
      (nullif(d->>'paidAt', '')::timestamptz + interval '4 years')::date,
      coalesce(nullif(d->'paid'->>'value', '')::numeric, nullif(d->'price'->>'value', '')::numeric),
      lower(nullif(trim(coalesce(d->'buyer'->>'email', d->'student'->>'email')), '')),
      v_id, d, now())
    on conflict (id_assinatura_eduzz) do update set
      status = excluded.status, status_normalizado = excluded.status_normalizado,
      inicio = coalesce(assinaturas_eduzz.inicio, excluded.inicio),
      proximo_vencimento = coalesce(assinaturas_eduzz.proximo_vencimento, excluded.proximo_vencimento),
      sincronizado_em = now();
    v_acao := 'black ' || v_ev;
  end if;

  -- Depois da primeira importação gravada, liga pessoa e contato na hora.
  if v_acao <> 'ignorado' and exists (select 1 from public.eventos where tipo = 'importacao' and detalhe->>'modo' = 'gravado') then
    perform public.assin_vincular(true);
  end if;
  return v_acao;
end;
$$;

revoke all on function public.assin_webhook_eduzz(jsonb) from public, anon, authenticated;
grant execute on function public.assin_webhook_eduzz(jsonb) to service_role;
