-- Correções de medição da auditoria de 05/07 (parte 2) + preparação do Breno.
--
-- 1) mql_cohort_stats ganha a COORTE MADURA: MQLs com 14+ dias desde a tag.
--    O histórico de mql_at começa em 15/06; MQL de anteontem ainda não teve
--    tempo de comprar e contava como "não comprou" — a "conversão real de MQL"
--    saía censurada pra baixo e rotulada de "todo o histórico".
--
-- 2) sync_meta_ads passa a aceitar VÁRIAS contas de anúncio (separadas por
--    vírgula no segredo meta_ads_account do Vault) e janela de 90 dias — o
--    negócio roda com "Canal do Anfitrião" e "CA2 - Canal do Anfitrião"; o
--    sync do banco só puxava a primeira e 30 dias. O gasto do dia é a SOMA
--    das contas. (O cron duplicado da Vercel, que nunca teve env configurado
--    e só gerava heartbeat de erro a cada 6h, sai do vercel.json — a rota
--    continua existindo para disparo manual.)
--
-- 3) Breno entra em sellers (3º vendedor, começa na semana de 06/07). Sem o
--    cadastro, as vendas dele cairiam no balde "sem vendedor" e a análise de
--    capacidade ficaria cega. O webhook do Unnichat ganhou fallback de match
--    pelo primeiro nome (quando inequívoco) para casar "Breno" ↔ "Breno
--    Sobrenome".

-- ---------- 1) Coorte madura na conversão de MQL ----------

drop function if exists public.mql_cohort_stats();

create function public.mql_cohort_stats()
returns table(
  mqls_total bigint,
  mqls_compraram bigint,
  vendas_curso_30d bigint,
  vendas_30d_de_mql bigint,
  mqls_maduros bigint,
  mqls_maduros_compraram bigint
)
language sql stable security definer
set search_path = public
as $$
  with curso as (
    select s.sale_date, s.lead_id, lower(coalesce(s.buyer_email,'')) as buyer_email
    from sales s
    where s.status='paga'
      and (lower(s.product) like '%5 estrelas%' or lower(s.product) like '%gigantes da temporada%')
      and lower(s.product) not similar to '%(encontro|ingresso|grupo|cadeira|pessoa adicional|checklist)%'
  ),
  mql as (
    select id, lower(coalesce(email,'')) as email,
           (mql_at at time zone 'America/Sao_Paulo')::date as mql_day
    from leads where mql_at is not null
  ),
  comprou as (
    select m.id from mql m where exists (
      select 1 from curso c
      where (c.lead_id = m.id or (m.email <> '' and c.buyer_email = m.email))
        and c.sale_date >= m.mql_day
    )
  )
  select
    (select count(*) from mql),
    (select count(*) from comprou),
    (select count(*) from curso where sale_date > current_date - 30),
    (select count(*) from curso c where c.sale_date > current_date - 30 and exists (
      select 1 from mql m
      where (c.lead_id = m.id or (m.email <> '' and c.buyer_email = m.email))
        and m.mql_day <= c.sale_date
    )),
    (select count(*) from mql where mql_day <= current_date - 14),
    (select count(*) from mql m join comprou co on co.id = m.id
      where m.mql_day <= current_date - 14);
$$;

-- ---------- 2) Meta Ads: múltiplas contas + janela de 90 dias ----------

create or replace function public.sync_meta_ads()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_token text; v_accounts text; v_account text; v_resp jsonb;
  v_dias int; v_total numeric; v_min date; v_max date;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name='meta_ads_token';
  select decrypted_secret into v_accounts from vault.decrypted_secrets where name='meta_ads_account';
  if v_token is null or v_accounts is null then raise exception 'token/conta da Meta ausentes no Vault'; end if;

  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','15000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','40000');

  create temp table _meta(date date, amount numeric) on commit drop;

  -- Janela de 90 dias (date_preset) para o sync se auto-corrigir depois de um
  -- período parado — com 30 dias, buracos antigos de gasto viravam permanentes.
  foreach v_account in array string_to_array(replace(v_accounts, ' ', ''), ',') loop
    continue when coalesce(v_account,'') = '';
    v_resp := (extensions.http_get(
      'https://graph.facebook.com/v21.0/'||v_account||'/insights?fields=spend&date_preset=last_90d&time_increment=1&limit=200&access_token='||v_token
    )).content::jsonb;
    if v_resp ? 'error' then
      raise exception 'Graph API (%): %', v_account, v_resp->'error'->>'message';
    end if;
    insert into _meta(date, amount)
    select (d->>'date_start')::date, (d->>'spend')::numeric
    from jsonb_array_elements(v_resp->'data') d;
  end loop;

  select count(distinct date), coalesce(sum(amount),0), min(date), max(date)
  into v_dias, v_total, v_min, v_max from _meta;

  if v_dias > 0 then
    delete from public.ad_spend where platform='meta_ads' and date between v_min and v_max;
    -- Soma por DIA entre as contas: a linha de ad_spend é por dia+plataforma.
    insert into public.ad_spend(date, platform, amount, campaign)
    select date, 'meta_ads', sum(amount), null from _meta group by date;
  end if;

  return jsonb_build_object('ok', true, 'dias', v_dias, 'total_brl', round(v_total,2), 'de', v_min, 'ate', v_max);
end;
$$;

-- ---------- 3) Breno no time ----------

insert into public.sellers (name, is_active)
select 'Breno', true
where not exists (select 1 from public.sellers where name ilike 'breno%');
