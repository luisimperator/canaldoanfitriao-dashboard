-- Venda da TMB aparecendo na hora (Fernando, 21/11: "Demorando pro dado refletir
-- o real"). O pedido só entrava em tmb_pedidos_raw pela cópia de hora em hora
-- (sync_tmb_pedidos); o aviso "Efetivado" do webhook já traz o pedido inteiro.
-- Agora o webhook grava o pedido novo na hora. Pedido que já existe não é
-- mexido: a cópia de hora em hora continua sendo quem atualiza (formato da API).
-- (0142 fica pra migração do Foley, "Movimentação Grupos".)
create or replace function public.tmb_pedido_do_webhook(p jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id bigint;
begin
  begin
    v_id := coalesce(nullif(p->>'pedido_id', '')::bigint, nullif(p->>'pedido', '')::bigint, nullif(p->>'id', '')::bigint);
    if v_id is null or coalesce(p->>'status_pedido', '') = '' or nullif(p->>'valor_total', '') is null then
      return false;
    end if;
    insert into public.tmb_pedidos_raw (
      pedido_id, data, status_pedido, status_financeiro, produto_id, lancamento,
      cliente, email, valor_total, parcelas, valor_entrada, valor_parcela,
      taxa_administracao, melhor_dia_pagamento, criado_em, data_efetivado, updated_at)
    values (
      v_id, p || jsonb_build_object('pedido_id', v_id, 'origem_copia', 'webhook'),
      p->>'status_pedido', p->>'status_financeiro', nullif(p->>'produto_id', '')::bigint,
      case when jsonb_typeof(p->'lancamento') = 'string' then p->>'lancamento' else coalesce(p->'lancamento'->>'nome', p->>'titulo') end,
      nullif(p->>'cliente', ''), nullif(p->>'email', ''),
      nullif(p->>'valor_total', '')::numeric, nullif(p->>'parcelas', '')::int,
      nullif(p->>'valor_entrada', '')::numeric, nullif(p->>'valor_parcela', '')::numeric,
      nullif(p->>'taxa_administracao', '')::numeric, nullif(p->>'melhor_dia_pagamento', '')::int,
      nullif(p->>'criado_em', '')::timestamptz, nullif(p->>'data_efetivado', '')::timestamp, now())
    on conflict (pedido_id) do nothing;
    return found;
  exception when others then
    insert into public.webhook_log (source, note, body) values ('tmb', 'pedido do webhook: falhou', jsonb_build_object('erro', sqlerrm));
    return false;
  end;
end;
$function$;
revoke all on function public.tmb_pedido_do_webhook(jsonb) from public, anon, authenticated;
