-- Cópia da TMB: não perde mais pedido quando a API falha no meio.
--
-- O pedido 2386591 (Débora, Anfitrião 5 Estrelas, efetivado em 19/11 15h50)
-- não chegou ao painel (Fernando, 20/11). Dois buracos:
-- 1) O webhook da TMB só está configurado no produto da Black: em todo o
--    histórico, os 113 eventos são da "Black Friday Histórica"; nenhum dos 48
--    pedidos do Anfitrião 5 Estrelas nem dos 9 do Gigantes avisou. Isso se
--    configura na TMB (fora daqui).
-- 2) A cópia de 20/11 1h45 rodou em 7 s, marcou "succeeded" e só atualizou
--    pedidos criados até 14/09: a janela de 21/09 a 19/11 voltou com erro e a
--    função pulou sem tentar de novo nem registrar. A mesma consulta, refeita
--    à mão às 2h, trouxe o pedido.
--
-- Agora:
-- - cada página tenta até 3 vezes (espera 2 s e 4 s) e erro de rede ou de
--   JSON conta como falha, sem derrubar o resto;
-- - as janelas vão da mais nova pra mais velha (o que vendeu hoje entra primeiro);
-- - falha que sobra fica em webhook_log (source 'tmb-sync', note 'sync falhou');
-- - uma cópia leve dos últimos 7 dias roda de hora em hora (1 chamada), além
--   das duas cópias completas do dia (0123).

create or replace function public.sync_tmb_pedidos(p_start date, p_end date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'vault'
 set statement_timeout to '600000'
as $function$
declare
  v_tok       text;
  v_win_start date;
  v_win_end   date;
  v_page      int;
  v_pages     int;
  v_status    int;
  v_body      text;
  v_resp      jsonb;
  v_cnt       int;
  v_total     int := 0;
  v_try       int;
begin
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'tmb_access_token';
  if v_tok is null then
    raise exception 'tmb_access_token ausente no Vault';
  end if;
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','10000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','45000');

  -- da janela mais nova pra mais velha (60 dias cada)
  v_win_end := p_end;
  while v_win_end >= p_start loop
    v_win_start := greatest(v_win_end - 59, p_start);
    v_page := 1;
    v_pages := 1;
    loop
      v_try := 0;
      loop
        v_try := v_try + 1;
        v_resp := null;
        begin
          select status, content into v_status, v_body
          from extensions.http(('GET',
            'https://api.tmbeducacao.com.br/api/pedidos?pageNumber=' || v_page ||
            '&pageSize=100&data_inicio=' || v_win_start || '&data_final=' || v_win_end,
            array[
              extensions.http_header('Authorization','Bearer ' || v_tok),
              extensions.http_header('Accept','application/json')
            ], null, null)::extensions.http_request);
          if v_status = 200 then
            v_resp := v_body::jsonb;
            if jsonb_typeof(v_resp->'data') is distinct from 'array' then
              v_status := -2;
              v_resp := null;
            end if;
          end if;
        exception when others then
          v_status := -1;
          v_body := sqlerrm;
        end;
        exit when v_resp is not null or v_try >= 3;
        perform pg_sleep(2 * v_try);
      end loop;

      if v_resp is null then
        insert into public.webhook_log (source, note, body, pendente, erro)
        values ('tmb-sync', 'sync falhou',
                jsonb_build_object('inicio', v_win_start, 'fim', v_win_end, 'pagina', v_page,
                                   'http', v_status, 'tentativas', v_try),
                false, left(coalesce(v_body, ''), 500));
        exit;
      end if;

      v_pages := greatest(coalesce((v_resp->>'totalPages')::int, 1), 1);

      insert into public.tmb_pedidos_raw (
        pedido_id, data, status_pedido, status_financeiro, produto_id, lancamento,
        cliente, email, valor_total, parcelas, valor_entrada, valor_parcela,
        taxa_administracao, melhor_dia_pagamento, criado_em, data_efetivado, updated_at)
      select
        (it->>'pedido_id')::bigint, it, it->>'status_pedido', it->>'status_financeiro',
        nullif(it->>'produto_id','')::bigint, it->>'lancamento',
        nullif(it->>'cliente',''), nullif(it->>'email',''),
        nullif(it->>'valor_total','')::numeric, nullif(it->>'parcelas','')::int,
        nullif(it->>'valor_entrada','')::numeric, nullif(it->>'valor_parcela','')::numeric,
        nullif(it->>'taxa_administracao','')::numeric, nullif(it->>'melhor_dia_pagamento','')::int,
        nullif(it->>'criado_em','')::timestamptz, nullif(it->>'data_efetivado','')::timestamp,
        now()
      from jsonb_array_elements(v_resp->'data') it
      on conflict (pedido_id) do update set
        data=excluded.data, status_pedido=excluded.status_pedido,
        status_financeiro=excluded.status_financeiro, produto_id=excluded.produto_id,
        lancamento=excluded.lancamento, cliente=excluded.cliente, email=excluded.email,
        valor_total=excluded.valor_total, parcelas=excluded.parcelas,
        valor_entrada=excluded.valor_entrada, valor_parcela=excluded.valor_parcela,
        taxa_administracao=excluded.taxa_administracao,
        melhor_dia_pagamento=excluded.melhor_dia_pagamento,
        criado_em=excluded.criado_em, data_efetivado=excluded.data_efetivado, updated_at=now();

      get diagnostics v_cnt = row_count;
      v_total := v_total + v_cnt;
      exit when v_page >= v_pages;
      v_page := v_page + 1;
    end loop;
    v_win_end := v_win_start - 1;
  end loop;

  return v_total;
end;
$function$;

-- Cópia leve dos últimos 7 dias, de hora em hora (minuto 25): venda nova da
-- TMB fora da Black aparece no painel em até 1 h.
select cron.schedule('sync-tmb-recentes', '25 * * * *',
  $$ select public.sync_tmb_pedidos(((now() at time zone 'America/Sao_Paulo')::date - 7),
                                    (now() at time zone 'America/Sao_Paulo')::date) $$);
