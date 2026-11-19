-- Placar da Imersão (topo da página /lancamento-pago), no formato do card que
-- o Foley manda no grupo: gasto no Meta, ingressos, vendido líquido, CPA bruto
-- e líquido, melhor criativo, cliques no link, checkouts e compras vistas pelo
-- Meta. Por dia e acumulado da turma.
--
-- 1. meta_campanha_diario: gasto e ações do Meta por campanha e dia. ad_spend
--    só tem o total do dia de todas as campanhas (sync_meta_ads); o placar
--    precisa só das campanhas da Imersão (nome começando com CDR).
-- 2. sync_meta_campanhas(): lê os últimos dias na Graph API com o mesmo token
--    do Vault da sync_meta_ads. Só leitura: não mexe em nada dos anúncios.
-- 3. imersao_placar(turma): números por dia da turma.

create table if not exists public.meta_campanha_diario (
  data date not null,
  campanha_id text not null,
  campanha text,
  conta text,
  gasto numeric not null default 0,
  cliques_link int not null default 0,
  checkouts int not null default 0,
  compras int not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (data, campanha_id)
);
alter table public.meta_campanha_diario enable row level security;

create or replace function public.sync_meta_campanhas(p_dias int default 10)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  v_token text; v_accounts text; v_account text;
  v_url text; v_resp jsonb; v_pag int; v_n int; v_linhas int := 0;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'meta_ads_token';
  select decrypted_secret into v_accounts from vault.decrypted_secrets where name = 'meta_ads_account';
  if v_token is null or v_accounts is null then
    raise exception 'token/conta da Meta ausentes no Vault';
  end if;

  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '15000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '40000');

  foreach v_account in array string_to_array(replace(v_accounts, ' ', ''), ',') loop
    continue when coalesce(v_account, '') = '';
    v_url := 'https://graph.facebook.com/v21.0/' || v_account || '/insights'
      || '?level=campaign&fields=campaign_id,campaign_name,spend,inline_link_clicks,actions'
      || '&time_increment=1&limit=500&time_range='
      || extensions.urlencode(jsonb_build_object('since', v_hoje - p_dias, 'until', v_hoje)::text)
      || '&access_token=' || v_token;
    v_pag := 0;
    -- A Graph API pagina a resposta: segue paging.next até o fim.
    while v_url is not null and v_pag < 10 loop
      v_resp := (extensions.http_get(v_url)).content::jsonb;
      if v_resp ? 'error' then
        raise exception 'Graph API (conta final %): %', right(v_account, 4), v_resp->'error'->>'message';
      end if;
      insert into public.meta_campanha_diario
        (data, campanha_id, campanha, conta, gasto, cliques_link, checkouts, compras, atualizado_em)
      select (d->>'date_start')::date,
             d->>'campaign_id',
             d->>'campaign_name',
             v_account,
             coalesce((d->>'spend')::numeric, 0),
             coalesce((d->>'inline_link_clicks')::numeric, 0)::int,
             coalesce((select max((x->>'value')::numeric) from jsonb_array_elements(d->'actions') x
                       where x->>'action_type' = 'initiate_checkout'), 0)::int,
             coalesce((select max((x->>'value')::numeric) from jsonb_array_elements(d->'actions') x
                       where x->>'action_type' = 'purchase'), 0)::int,
             now()
      from jsonb_array_elements(coalesce(v_resp->'data', '[]'::jsonb)) d
      on conflict (data, campanha_id) do update
        set campanha = excluded.campanha,
            conta = excluded.conta,
            gasto = excluded.gasto,
            cliques_link = excluded.cliques_link,
            checkouts = excluded.checkouts,
            compras = excluded.compras,
            atualizado_em = now();
      get diagnostics v_n = row_count;
      v_linhas := v_linhas + v_n;
      v_url := v_resp->'paging'->>'next';
      v_pag := v_pag + 1;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'linhas', v_linhas, 'de', v_hoje - p_dias, 'ate', v_hoje);
end;
$$;

revoke all on function public.sync_meta_campanhas(int) from public, anon, authenticated;

-- De meia em meia hora (o placar de "hoje" fica no máximo 30 min atrasado).
select cron.schedule('sync-meta-campanhas', '7,37 * * * *',
  $$ select public.sync_meta_campanhas() $$);

-- Números da turma por dia. O gasto entra pelos dias de venda da turma (do
-- sábado do evento anterior até a sexta), só das campanhas CDR (Chuva de
-- Reservas). Vendido líquido = o que a Eduzz repassa (netGain); venda que a
-- cópia da Eduzz ainda não trouxe usa a mesma proporção líquido/bruto das
-- outras da turma.
create or replace function public.imersao_placar(p_turma date)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with comp as (
    select (c.pago_em at time zone 'America/Sao_Paulo')::date dia,
           c.valor,
           nullif((s.data->'netGain'->>'value')::numeric, 0) net,
           c.utm_content
    from imersao_compradores c
    left join eduzz_sales_raw s on s.id::text = c.eduzz_invoice_id::text
    where c.turma_data = p_turma and c.status = 'pago' and c.pago_em is not null
  ),
  taxa as (
    select coalesce(sum(net) / nullif(sum(valor) filter (where net is not null), 0), 1) r from comp
  ),
  vend as (
    select dia, count(*) ingressos, sum(valor) bruto,
           sum(coalesce(net, valor * (select r from taxa))) liquido
    from comp group by dia
  ),
  meta as (
    select data dia, sum(gasto) gasto, sum(cliques_link) cliques, sum(checkouts) checkouts,
           sum(compras) compras, max(atualizado_em) atualizado_em
    from meta_campanha_diario
    where campanha ilike 'CDR%' and data between p_turma - 7 and p_turma - 1
    group by data
  ),
  dias as (
    select generate_series(p_turma - 7, p_turma - 1, interval '1 day')::date dia
    union
    select dia from comp
  )
  select jsonb_build_object(
    'turma', p_turma,
    'dias', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'dia', d.dia,
               'ingressos', coalesce(v.ingressos, 0),
               'bruto', coalesce(v.bruto, 0),
               'liquido', round(coalesce(v.liquido, 0), 2),
               'gasto', coalesce(m.gasto, 0),
               'cliques', coalesce(m.cliques, 0),
               'checkouts', coalesce(m.checkouts, 0),
               'compras_meta', coalesce(m.compras, 0)
             ) order by d.dia), '[]'::jsonb)
      from dias d left join vend v on v.dia = d.dia left join meta m on m.dia = d.dia
    ),
    'melhor_criativo', (
      select jsonb_build_object('nome', utm_content, 'vendas', count(*))
      from comp
      where utm_content is not null and utm_content !~ '\{\{'
      group by utm_content
      order by count(*) desc
      limit 1
    ),
    'meta_atualizado_em', (select max(atualizado_em) from meta)
  );
$$;

revoke all on function public.imersao_placar(date) from public, anon, authenticated;
