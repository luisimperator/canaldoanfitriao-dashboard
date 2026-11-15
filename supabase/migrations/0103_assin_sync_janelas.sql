-- Sincronização das assinaturas da Eduzz por janela de datas.
--
-- A paginação de /myeduzz/v1/subscriptions não é estável: puxando 129 páginas
-- seguidas vieram 1.931 itens mas só 1.569 assinaturas diferentes (repetiu
-- umas e pulou outras). Aqui cada janela de criação (startDate/endDate com
-- filterBy=creation) é dividida ao meio até caber numa página só (15 itens);
-- só um dia com mais de 15 assinaturas é paginado.
-- O endDate da Eduzz é EXCLUSIVO (endDate=2023-04-16 vai até 15/04 23:59:59),
-- então a janela é [p_ini, p_fim) e as metades se encostam: [ini, meio) e
-- [meio, fim).

create or replace function public.assin_sync_eduzz_janela(p_ini date, p_fim date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
set statement_timeout to '600000'
as $$
declare
  v_tok text;
  v_status integer;
  v_resp jsonb;
  v_it jsonb;
  v_pages integer;
  v_page integer;
  v_meio date;
  v_a jsonb;
  v_b jsonb;
  v_total integer := 0;
  v_chamadas integer := 0;
begin
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'eduzz_access_token';
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '10000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '30000');

  select status, content::jsonb into v_status, v_resp
  from extensions.http(('GET',
    'https://api.eduzz.com/myeduzz/v1/subscriptions?page=1&itemsPerPage=15&filterBy=creation&startDate=' || p_ini || '&endDate=' || p_fim,
    array[extensions.http_header('Authorization', 'Bearer ' || v_tok), extensions.http_header('Accept', 'application/json')],
    null, null)::extensions.http_request);
  v_chamadas := 1;
  if v_status <> 200 then
    return jsonb_build_object('gravadas', 0, 'chamadas', v_chamadas, 'erro', v_status, 'janela', p_ini || '..' || p_fim);
  end if;
  v_pages := coalesce((v_resp->>'pages')::int, 1);

  -- Mais de uma página e a janela tem mais de um dia: divide ao meio.
  if v_pages > 1 and p_fim - p_ini > 1 then
    v_meio := p_ini + ((p_fim - p_ini) / 2);
    v_a := public.assin_sync_eduzz_janela(p_ini, v_meio);
    v_b := public.assin_sync_eduzz_janela(v_meio, p_fim);
    return jsonb_build_object(
      'gravadas', coalesce((v_a->>'gravadas')::int, 0) + coalesce((v_b->>'gravadas')::int, 0),
      'chamadas', v_chamadas + coalesce((v_a->>'chamadas')::int, 0) + coalesce((v_b->>'chamadas')::int, 0),
      'erro', coalesce(v_a->'erro', v_b->'erro'));
  end if;

  -- Cabe numa página (ou é um dia só): grava.
  v_page := 1;
  loop
    for v_it in select * from jsonb_array_elements(coalesce(v_resp->'items', '[]'::jsonb)) loop
      perform public.assin_gravar_item_eduzz(v_it);
      v_total := v_total + 1;
    end loop;
    v_page := v_page + 1;
    exit when v_page > v_pages;
    select status, content::jsonb into v_status, v_resp
    from extensions.http(('GET',
      'https://api.eduzz.com/myeduzz/v1/subscriptions?page=' || v_page || '&itemsPerPage=15&filterBy=creation&startDate=' || p_ini || '&endDate=' || p_fim,
      array[extensions.http_header('Authorization', 'Bearer ' || v_tok), extensions.http_header('Accept', 'application/json')],
      null, null)::extensions.http_request);
    v_chamadas := v_chamadas + 1;
    exit when v_status <> 200;
  end loop;
  return jsonb_build_object('gravadas', v_total, 'chamadas', v_chamadas,
    'erro', case when v_status <> 200 then v_status end);
end;
$$;

revoke all on function public.assin_sync_eduzz_janela(date, date) from public, anon, authenticated;
grant execute on function public.assin_sync_eduzz_janela(date, date) to service_role;

-- Produto que faltava no mapa: renovação anual do grupo do aluno antigo.
insert into public.produtos_grupos (produto_eduzz_id, produto, nome_grupo, cadeira_extra)
values ('2626179', 'A5E (renovação do grupo, aluno antigo)', '[Membros] A5E', false)
on conflict (produto_eduzz_id, nome_grupo) do nothing;

-- Atrasada: o vencimento que vale é o da cobrança em aberto (currentDue), não
-- o próximo (nextDue), pra dar os dias de atraso certos.
create or replace function public.assin_gravar_item_eduzz(it jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_freq interval;
  v_cur date := nullif(it->'recurrence'->>'currentDue', '')::date;
  v_prox date;
begin
  v_freq := (coalesce(nullif(it->'recurrence'->'frequency'->>'value', '')::int, 1)
    || case it->'recurrence'->'frequency'->>'type' when 'monthly' then ' months' when 'weekly' then ' weeks' when 'daily' then ' days' else ' years' end)::interval;
  v_prox := case
    when it->>'status' in ('late', 'suspended') then coalesce(v_cur, nullif(it->'recurrence'->>'nextDue', '')::date)
    else coalesce(nullif(it->'recurrence'->>'nextDue', '')::date,
      case when it->>'status' = 'upToDate' and v_cur <= current_date then (v_cur + v_freq)::date else v_cur end)
  end;
  insert into public.assinaturas_eduzz (id_assinatura_eduzz, tipo, produto_eduzz_id, produto, status, status_normalizado,
    inicio, proximo_vencimento, valor, cupom, email_comprador, id_primeira_fatura, dados, sincronizado_em)
  values (it->>'id', 'assinatura', it->'products'->0->>'id', it->'products'->0->>'title', it->>'status',
    public.assin_norm_status(it->>'status'),
    nullif(it->'recurrence'->>'startsAt', '')::date, v_prox,
    nullif(it->'payment'->'price'->>'value', '')::numeric, null,
    lower(nullif(trim(it->'client'->>'email'), '')), it->>'firstInvoiceId', it, now())
  on conflict (id_assinatura_eduzz) do update set
    produto_eduzz_id = excluded.produto_eduzz_id, produto = excluded.produto, status = excluded.status,
    status_normalizado = excluded.status_normalizado, inicio = excluded.inicio,
    proximo_vencimento = excluded.proximo_vencimento, valor = excluded.valor,
    cupom = coalesce(excluded.cupom, assinaturas_eduzz.cupom), email_comprador = excluded.email_comprador,
    id_primeira_fatura = excluded.id_primeira_fatura, dados = excluded.dados, sincronizado_em = now();
end;
$$;
