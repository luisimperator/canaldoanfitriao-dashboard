-- Saldo Eduzz cravado pelo extrato (fim da âncora manual).
--
-- A API da Eduzz não tem endpoint de saldo, mas GET /myeduzz/v2/financial/statement
-- é um razão completo: venda (+), reembolso (−), transferência pra conta bancária (−)
-- e tarifa (−). O somatório de todos os lançamentos com creditDate <= now() É o saldo
-- disponível na Eduzz (validado contra o saldo real: diferença de centavos/ajuste fino
-- da âncora que estava defasada).
--
-- provisao_caixa() passa a devolver saldo_eduzz_extrato; a âncora manual
-- (provisao_ajustes.saldo_eduzz) vira fallback caso o extrato pare de sincronizar.

create table if not exists public.eduzz_statement_raw (
  id text primary key,
  tipo text,                       -- 'sale' | 'refund' | null (transferências/tarifas)
  valor numeric not null,          -- sinal já vem do extrato (saída = negativo)
  credit_date timestamptz not null,
  sale_id text,
  description text,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);
create index if not exists eduzz_statement_credit_date_idx on public.eduzz_statement_raw (credit_date);
alter table public.eduzz_statement_raw enable row level security;

-- Sync incremental do extrato. Ranges longos (> ~12 meses) fazem a API devolver
-- vazio — o backfill histórico foi feito em janelas semestrais/trimestrais.
create or replace function public.sync_eduzz_statement(p_start date, p_end date)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
set statement_timeout to '600000'
as $function$
declare v_tok text; v_page int:=1; v_pages int:=1; v_status int; v_resp jsonb; v_cnt int; v_total int:=0;
begin
  select decrypted_secret into v_tok from vault.decrypted_secrets where name='eduzz_access_token';
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','10000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','45000');
  loop
    select status, content::jsonb into v_status, v_resp
    from extensions.http(('GET',
      'https://api.eduzz.com/myeduzz/v2/financial/statement?page='||v_page||'&itemsPerPage=100&startDate='||p_start||'&endDate='||p_end,
      array[extensions.http_header('Authorization','Bearer '||v_tok),extensions.http_header('Accept','application/json')],null,null)::extensions.http_request);
    exit when v_status <> 200;
    v_pages := coalesce((v_resp->>'pages')::int,1);
    insert into public.eduzz_statement_raw(id,tipo,valor,credit_date,sale_id,description,raw,synced_at)
    select it->>'id', it->>'type', (it->'value'->>'value')::numeric,
      (it->>'creditDate')::timestamptz, it->>'saleId', it->>'description', it, now()
    from jsonb_array_elements(v_resp->'items') it
    where it->>'id' is not null and it->>'creditDate' is not null
    on conflict (id) do update set tipo=excluded.tipo, valor=excluded.valor,
      credit_date=excluded.credit_date, sale_id=excluded.sale_id,
      description=excluded.description, raw=excluded.raw, synced_at=now();
    get diagnostics v_cnt = row_count; v_total := v_total + v_cnt;
    exit when v_page >= v_pages;
    v_page := v_page + 1;
  end loop;
  return v_total;
end;$function$;

-- A cada 2h, janela de 45 dias: pega liberações novas, reembolsos retroativos
-- e saques do dia. (upsert pelo nome do job — idempotente)
select cron.schedule('sync-eduzz-statement', '25 */2 * * *',
  $$select public.sync_eduzz_statement(current_date - 45, current_date + 1)$$);

create or replace function public.provisao_caixa()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with fator as (
    select coalesce(avg((data->'netGain'->>'value')::numeric / nullif((data->'total'->>'value')::numeric,0)), 0.9) as f
    from eduzz_sales_raw
    where status='paid' and (data->>'paidAt')::timestamptz > now() - interval '90 days'
      and (data->'total'->>'value')::numeric > 0
  ),
  lags as (
    select data->>'paymentMethod' as metodo,
      (percentile_cont(0.5) within group (order by
        extract(epoch from ((data->>'creditDate')::timestamptz - (data->>'paidAt')::timestamptz))/86400))::numeric as lag_dias
    from eduzz_sales_raw
    where status='paid' and (data->>'creditDate') is not null and (data->>'paidAt') is not null
      and (data->>'paidAt')::timestamptz > now() - interval '120 days'
    group by 1
  ),
  pago_rows as (
    select ((data->>'creditDate')::timestamptz at time zone 'America/Sao_Paulo')::date as dia,
      (data->'netGain'->>'value')::numeric as valor,
      coalesce(data->'buyer'->>'name', '—') as nome,
      coalesce(data->'product'->>'name', '—') as produto,
      coalesce(data->>'paymentMethod', '—') as metodo
    from eduzz_sales_raw
    where status='paid' and (data->>'creditDate')::timestamptz > now()
  ),
  pago_futuro as (
    select dia, sum(valor) as valor, count(*) as cobrancas,
      jsonb_agg(jsonb_build_object('nome', nome, 'produto', produto, 'metodo', metodo,
        'valor', round(valor)) order by valor desc) as items
    from pago_rows
    group by 1
  ),
  vencer_rows as (
    select (
        ((data->>'dueDate')::timestamptz at time zone 'America/Sao_Paulo')::date
        + coalesce((select round(l.lag_dias)::int from lags l where l.metodo = data->>'paymentMethod'), 2)
      ) as dia,
      coalesce(nullif((data->'netGain'->>'value')::numeric, 0),
               (data->'total'->>'value')::numeric * (select f from fator)) as valor,
      coalesce(data->'buyer'->>'name', '—') as nome,
      coalesce(data->'product'->>'name', '—') as produto,
      coalesce(data->>'paymentMethod', '—') as metodo
    from eduzz_sales_raw
    where status in ('waitingPayment','open','scheduled')
      and (data->>'dueDate') is not null
      and (data->>'dueDate')::timestamptz >= now() - interval '2 days'
      and (data->>'dueDate')::timestamptz <= now() + interval '60 days'
      and (data->'total'->>'value')::numeric > 0
  ),
  a_vencer as (
    select dia, sum(valor) as valor, count(*) as cobrancas,
      jsonb_agg(jsonb_build_object('nome', nome, 'produto', produto, 'metodo', metodo,
        'valor', round(valor)) order by valor desc) as items
    from vencer_rows
    group by 1
  ),
  saldo_inter as (
    select coalesce(sum(amount) filter (where direction='in'),0)
         - coalesce(sum(amount) filter (where direction='out'),0) as saldo
    from fin_transactions
  ),
  -- saldo Eduzz cravado: soma do razão completo até agora
  extrato as (
    select round(sum(valor), 2) as saldo, max(synced_at) as sync_em
    from eduzz_statement_raw
    where credit_date <= now()
  ),
  ancora as (
    select valor, updated_at from provisao_ajustes where chave = 'saldo_eduzz'
  )
  select jsonb_build_object(
    'hoje', current_date,
    'saldo_inter', (select round(saldo::numeric, 2) from saldo_inter),
    'saldo_eduzz_extrato', (select case when saldo is null then null else
      jsonb_build_object('valor', saldo, 'atualizado_em', sync_em) end from extrato),
    'saldo_eduzz_ancora', (select jsonb_build_object('valor', valor, 'informado_em', updated_at) from ancora),
    'liberado_desde_ancora', (
      select coalesce(round(sum((data->'netGain'->>'value')::numeric)), 0)
      from eduzz_sales_raw, ancora
      where status='paid'
        and (data->>'creditDate')::timestamptz > ancora.updated_at
        and (data->>'creditDate')::timestamptz <= now()
    ),
    'a_liberar_total', (select coalesce(round(sum(valor)), 0) from pago_futuro),
    'a_liberar_cobrancas', (select coalesce(sum(cobrancas), 0) from pago_futuro),
    'pago_por_dia', (select coalesce(jsonb_agg(jsonb_build_object(
        'dia', dia, 'valor', round(valor), 'cobrancas', cobrancas, 'items', items) order by dia), '[]'::jsonb) from pago_futuro),
    'a_vencer_por_dia', (select coalesce(jsonb_agg(jsonb_build_object(
        'dia', dia, 'valor', round(valor), 'cobrancas', cobrancas, 'items', items) order by dia), '[]'::jsonb) from a_vencer),
    'a_vencer_total', (select coalesce(round(sum(valor)), 0) from a_vencer),
    'a_vencer_cobrancas', (select coalesce(sum(cobrancas), 0) from a_vencer),
    'lags', (select coalesce(jsonb_object_agg(metodo, round(lag_dias, 1)), '{}'::jsonb) from lags),
    'saidas_programadas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'descricao', descricao, 'valor', valor, 'data', data, 'prevista', prevista) order by data), '[]'::jsonb)
      from provisao_saidas where data >= current_date)
  );
$function$;
