-- Tráfego da Meta por ciclo de cobrança (Fernando, 25/11: "cria um
-- painelzinho de quanto estamos gastando de tráfego no ciclo atual da meta, e
-- quanto gastamos nos ciclos passados, e quando teremos que pagar por ele.
-- Também preciso saber quanto tem de faturamento atribuído àquele ciclo").
--
-- A conta é de faturamento mensal (monthly invoicing, Net 30): o ciclo é o
-- mês; a Meta emite a fatura no dia 1–2 do mês seguinte (gasto + impostos) e
-- ela vence 30 dias depois. Tudo vem da própria Meta, pelo token dos anúncios
-- no Vault:
--   · business_invoices: as faturas (número, ciclo, valor, em aberto,
--     vencimento, situação);
--   · owned_ad_accounts: as contas de anúncio e o saldo devedor de cada uma;
--   · insights mensais por conta: gasto (sem imposto) e as compras que o
--     pixel atribuiu.
-- As previsões da provisão de caixa (provisao_saidas) NÃO são tocadas: o
-- painel só as mostra ao lado da fatura real (Fernando, 20/11: "Não mexe
-- nada").

create table if not exists public.meta_contas_anuncio (
  conta_id text primary key,
  nome text,
  moeda text,
  saldo numeric(14,2),          -- valor ainda não pago na Meta
  gasto_total numeric(14,2),
  pagamento text,               -- ex.: "monthly invoicing"
  atualizado_em timestamptz not null default now()
);

create table if not exists public.meta_faturas (
  fatura_id text primary key,   -- id da Graph
  numero text,                  -- número da fatura (invoice_id)
  ciclo date,                   -- mês do gasto (billing_period)
  emitida_em timestamptz,
  vence_em date,                -- vencimento, dia de Brasília
  valor numeric(14,2),          -- total da fatura (com impostos)
  em_aberto numeric(14,2),
  situacao text,                -- Paid / Unpaid / ...
  tipo text,                    -- Invoice / Credit memo ...
  prazo text,
  contas text[],
  atualizado_em timestamptz not null default now()
);

create table if not exists public.meta_gasto_mensal (
  mes date not null,
  conta_id text not null,
  gasto numeric(14,2) not null default 0,         -- sem imposto
  compras_meta numeric(14,2) not null default 0,  -- valor de compra atribuído pelo pixel
  atualizado_em timestamptz not null default now(),
  primary key (mes, conta_id)
);

alter table public.meta_contas_anuncio enable row level security;
alter table public.meta_faturas enable row level security;
alter table public.meta_gasto_mensal enable row level security;
revoke all on public.meta_contas_anuncio, public.meta_faturas, public.meta_gasto_mensal from anon, authenticated;

create or replace function public.sync_meta_faturas(p_meses int default 13)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  v_token text;
  v_conta0 text;
  v_biz text;
  v_resp jsonb;
  v_url text;
  v_pag int;
  v_conta text;
  v_ini date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) - make_interval(months => p_meses - 1))::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  n_faturas int := 0;
  n_meses int := 0;
  n int;
  v_erros text[] := '{}';
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'meta_ads_token';
  select split_part(replace(decrypted_secret, ' ', ''), ',', 1) into v_conta0 from vault.decrypted_secrets where name = 'meta_ads_account';
  if v_token is null or v_conta0 is null then
    raise exception 'token/conta da Meta ausentes no Vault';
  end if;

  perform http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '10000');
  perform http_set_curlopt('CURLOPT_TIMEOUT_MS', '40000');

  v_resp := (http_get('https://graph.facebook.com/v21.0/' || v_conta0 || '?fields=business&access_token=' || v_token)).content::jsonb;
  v_biz := v_resp->'business'->>'id';
  if v_biz is null then
    raise exception 'Graph (empresa): %', coalesce(v_resp->'error'->>'message', 'sem business');
  end if;

  -- Contas de anúncio e saldo devedor.
  begin
    v_resp := (http_get('https://graph.facebook.com/v21.0/' || v_biz
      || '/owned_ad_accounts?fields=id,name,currency,amount_spent,balance,funding_source_details{display_string}&limit=50&access_token=' || v_token)).content::jsonb;
    if v_resp ? 'error' then
      raise exception '%', v_resp->'error'->>'message';
    end if;
    insert into meta_contas_anuncio (conta_id, nome, moeda, saldo, gasto_total, pagamento, atualizado_em)
    select x->>'id', x->>'name', x->>'currency', (x->>'balance')::numeric / 100, (x->>'amount_spent')::numeric / 100,
           x->'funding_source_details'->>'display_string', now()
    from jsonb_array_elements(v_resp->'data') x
    on conflict (conta_id) do update
      set nome = excluded.nome, moeda = excluded.moeda, saldo = excluded.saldo, gasto_total = excluded.gasto_total,
          pagamento = excluded.pagamento, atualizado_em = now();
  exception when others then
    v_erros := v_erros || ('contas: ' || sqlerrm);
  end;

  -- Faturas da empresa (todas as contas de faturamento mensal).
  begin
    v_url := 'https://graph.facebook.com/v21.0/' || v_biz
      || '/business_invoices?fields=id,invoice_id,invoice_date,due_date,billing_period,amount,amount_due,payment_status,type,payment_term,ad_account_ids&limit=50&access_token=' || v_token;
    v_pag := 0;
    while v_url is not null and v_pag < 10 loop
      v_resp := (http_get(v_url)).content::jsonb;
      if v_resp ? 'error' then
        raise exception '%', v_resp->'error'->>'message';
      end if;
      insert into meta_faturas (fatura_id, numero, ciclo, emitida_em, vence_em, valor, em_aberto, situacao, tipo, prazo, contas, atualizado_em)
      select x->>'id', x->>'invoice_id', (x->>'billing_period')::date, (x->>'invoice_date')::timestamptz,
             ((x->>'due_date')::timestamptz at time zone 'America/Sao_Paulo')::date,
             (x->>'amount')::numeric / 100, (x->'amount_due'->>'amount_in_hundredths')::numeric / 100,
             x->>'payment_status', x->>'type', x->>'payment_term',
             array(select jsonb_array_elements_text(coalesce(x->'ad_account_ids', '[]'::jsonb))), now()
      from jsonb_array_elements(v_resp->'data') x
      on conflict (fatura_id) do update
        set numero = excluded.numero, ciclo = excluded.ciclo, emitida_em = excluded.emitida_em, vence_em = excluded.vence_em,
            valor = excluded.valor, em_aberto = excluded.em_aberto, situacao = excluded.situacao, tipo = excluded.tipo,
            prazo = excluded.prazo, contas = excluded.contas, atualizado_em = now();
      get diagnostics n = row_count;
      n_faturas := n_faturas + n;
      v_url := v_resp->'paging'->>'next';
      v_pag := v_pag + 1;
    end loop;
  exception when others then
    v_erros := v_erros || ('faturas: ' || sqlerrm);
  end;

  -- Gasto (sem imposto) e compras do pixel, mês a mês, por conta.
  for v_conta in select conta_id from meta_contas_anuncio loop
    begin
      v_resp := (http_get('https://graph.facebook.com/v21.0/' || v_conta
        || '/insights?fields=spend,action_values&time_increment=monthly&limit=50'
        || '&time_range=' || replace(jsonb_build_object('since', v_ini, 'until', v_hoje)::text, ' ', '')
        || '&access_token=' || v_token)).content::jsonb;
      if v_resp ? 'error' then
        raise exception '%', v_resp->'error'->>'message';
      end if;
      insert into meta_gasto_mensal (mes, conta_id, gasto, compras_meta, atualizado_em)
      select date_trunc('month', (d->>'date_start')::date)::date, v_conta, coalesce((d->>'spend')::numeric, 0),
             coalesce((select (a->>'value')::numeric from jsonb_array_elements(coalesce(d->'action_values', '[]'::jsonb)) a
                       where a->>'action_type' = 'omni_purchase' limit 1),
                      (select (a->>'value')::numeric from jsonb_array_elements(coalesce(d->'action_values', '[]'::jsonb)) a
                       where a->>'action_type' = 'purchase' limit 1), 0),
             now()
      from jsonb_array_elements(v_resp->'data') d
      on conflict (mes, conta_id) do update
        set gasto = excluded.gasto, compras_meta = excluded.compras_meta, atualizado_em = now();
      get diagnostics n = row_count;
      n_meses := n_meses + n;
    exception when others then
      v_erros := v_erros || (v_conta || ' gasto: ' || sqlerrm);
    end;
  end loop;

  insert into webhook_log (source, note, body)
  values ('meta_faturas', case when cardinality(v_erros) = 0 then 'ok' else 'erro' end,
          jsonb_build_object('faturas', n_faturas, 'meses', n_meses, 'erros', to_jsonb(v_erros)));

  return jsonb_build_object('ok', cardinality(v_erros) = 0, 'faturas', n_faturas, 'meses', n_meses, 'erros', to_jsonb(v_erros));
end;
$$;

revoke all on function public.sync_meta_faturas(int) from public, anon, authenticated;

-- ── Leitura do painel (/custos/trafego) ─────────────────────────────────────
-- Um ciclo por mês. Faturamento do ciclo = tudo o que foi pago no mês (Eduzz,
-- TMB pelo valor total na efetivação e ingressos da Imersão): é blended, como
-- o CAC/ROAS, porque quase nenhuma venda chega com UTM de anúncio.

create or replace function public.painel_meta_trafego(p_meses int default 12)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with meses as (
    select generate_series(
      date_trunc('month', (now() at time zone 'America/Sao_Paulo')) - make_interval(months => p_meses - 1),
      date_trunc('month', (now() at time zone 'America/Sao_Paulo')),
      interval '1 month')::date mes
  ),
  gasto as (
    select mes, sum(gasto) gasto, sum(compras_meta) compras_meta from meta_gasto_mensal group by 1
  ),
  faturas as (
    select ciclo mes, sum(valor) valor, sum(em_aberto) em_aberto, max(vence_em) vence_em,
           string_agg(distinct situacao, ', ') situacao, string_agg(numero, ', ' order by numero) numeros
    from meta_faturas where coalesce(tipo, 'Invoice') = 'Invoice'
    group by 1
  ),
  eduzz as (
    select date_trunc('month', sale_date)::date mes, sum(amount) valor, count(*) n
    from sales where status = 'paga' group by 1
  ),
  tmb as (
    select date_trunc('month', data_efetivado)::date mes, sum(valor_total) valor, count(*) n
    from tmb_pedidos_raw where status_pedido = 'Efetivado' and data_efetivado is not null group by 1
  ),
  imersao as (
    select date_trunc('month', (coalesce(pago_em, created_at) at time zone 'America/Sao_Paulo'))::date mes, sum(valor) valor, count(*) n
    from imersao_compradores where status = 'pago' group by 1
  ),
  provisao as (
    select m.mes, sum(s.valor) valor, min(s.data) data
    from meses m
    join provisao_saidas s on s.descricao ilike 'Fatura Meta%'
      and s.data between (m.mes + interval '1 month')::date and (m.mes + interval '2 months')::date + 3
    group by 1
  ),
  -- Imposto que a Meta põe em cima do gasto: média das 3 últimas faturas.
  fator as (
    select coalesce(avg(u.valor / nullif(g.gasto, 0)), 1) fx
    from (select * from faturas order by mes desc limit 3) u
    join gasto g using (mes)
    where g.gasto > 0
  )
  select jsonb_build_object(
    'ciclos', (select jsonb_agg(jsonb_build_object(
        'mes', m.mes,
        'gasto', round(coalesce(g.gasto, 0), 2),
        'compras_meta', round(coalesce(g.compras_meta, 0), 2),
        'fatura', f.valor,
        'em_aberto', f.em_aberto,
        'vence_em', f.vence_em,
        'situacao', f.situacao,
        'numeros', f.numeros,
        -- Sem fatura ainda: só o ciclo aberto (e o anterior, até a Meta emitir
        -- no dia 1–2). Mês antigo sem fatura foi cobrado direto no cartão
        -- (antes do faturamento mensal).
        'fatura_prevista', case when f.valor is null and m.mes >= (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) - interval '1 month')::date
          then round(coalesce(g.gasto, 0) * (select fx from fator), 2) end,
        'vence_previsto', case when f.valor is null and m.mes >= (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) - interval '1 month')::date
          then (m.mes + interval '2 months')::date end,
        'provisao', p.valor,
        'provisao_data', p.data,
        'eduzz', round(coalesce(e.valor, 0), 2), 'eduzz_n', coalesce(e.n, 0),
        'tmb', round(coalesce(t.valor, 0), 2), 'tmb_n', coalesce(t.n, 0),
        'imersao', round(coalesce(i.valor, 0), 2), 'imersao_n', coalesce(i.n, 0)
      ) order by m.mes desc)
      from meses m
      left join gasto g using (mes)
      left join faturas f using (mes)
      left join eduzz e using (mes)
      left join tmb t using (mes)
      left join imersao i using (mes)
      left join provisao p using (mes)),
    'fator_imposto', (select round(fx, 4) from fator),
    'contas', (select coalesce(jsonb_agg(jsonb_build_object('conta_id', conta_id, 'nome', nome, 'saldo', saldo, 'pagamento', pagamento) order by saldo desc nulls last), '[]'::jsonb) from meta_contas_anuncio),
    'gasto_dias', (select coalesce(jsonb_agg(jsonb_build_object('dia', date, 'gasto', round(v, 2)) order by date), '[]'::jsonb)
                   from (select date, sum(amount) v from ad_spend where platform = 'meta_ads'
                         and date >= (now() at time zone 'America/Sao_Paulo')::date - 40 group by 1) x),
    'ultima_sync', (select jsonb_build_object('em', created_at, 'note', note, 'erros', body->'erros')
                    from webhook_log where source = 'meta_faturas' order by created_at desc limit 1)
  );
$$;

revoke all on function public.painel_meta_trafego(int) from public, anon, authenticated;

-- A cada 3 h (são umas 5 chamadas à Meta, rápido).
select cron.unschedule('meta-faturas') where exists (select 1 from cron.job where jobname = 'meta-faturas');
select cron.schedule('meta-faturas', '41 */3 * * *', $$select public.sync_meta_faturas()$$);
