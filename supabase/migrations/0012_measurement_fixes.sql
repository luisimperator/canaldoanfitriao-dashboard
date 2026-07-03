-- Correções de medição (auditoria de julho/2026):
--
-- 1) Funções de MQL passam a contar o DIA no fuso de São Paulo. mql_at é
--    timestamptz; truncar em UTC jogava os MQLs das 21h–24h (16% deles) no
--    dia seguinte.
-- 2) upsert_mailchimp_leads: o sync do Mailchimp sobrescrevia a base inteira a
--    cada execução — rebaixava status (quente/convertido viravam frio),
--    substituía o extra (apagando tags "cliente"/"comprou:" do Eduzz) e
--    re-datava created_at. O merge preserva o que veio do CRM/Eduzz.
-- 3) sales.status passa a aceitar 'chargeback' — o webhook da Eduzz já tentava
--    gravar esse status e o CHECK rejeitava em silêncio.
-- 4) ad_spend: o unique (date, platform, campaign) com campaign NULL nunca
--    conflita (NULLs distintos), então o upsert do sync viraria INSERT puro e
--    duplicaria o gasto a cada execução do cron. NULLS NOT DISTINCT resolve.

-- ---------- 1) Fuso de São Paulo nas funções de MQL ----------

create or replace function public.mql_new_daily(p_days int default 90)
returns table(day date, mql bigint)
language sql stable security definer
set search_path = public
as $$
  select (mql_at at time zone 'America/Sao_Paulo')::date as day, count(*)::bigint as mql
  from public.leads
  where mql_at is not null
    and (mql_at at time zone 'America/Sao_Paulo')::date > current_date - p_days
  group by 1
  order by 1;
$$;

create or replace function public.mql_cohort_stats()
returns table(
  mqls_total bigint,
  mqls_compraram bigint,
  vendas_curso_30d bigint,
  vendas_30d_de_mql bigint
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
  )
  select
    (select count(*) from mql),
    (select count(*) from mql m where exists (
      select 1 from curso c
      where (c.lead_id = m.id or (m.email <> '' and c.buyer_email = m.email))
        and c.sale_date >= m.mql_day
    )),
    (select count(*) from curso where sale_date > current_date - 30),
    (select count(*) from curso c where c.sale_date > current_date - 30 and exists (
      select 1 from mql m
      where (c.lead_id = m.id or (m.email <> '' and c.buyer_email = m.email))
        and m.mql_day <= c.sale_date
    ));
$$;

-- ---------- 2) Upsert do Mailchimp sem clobbering ----------
--
-- Regras do merge, por coluna:
--   created_at: NUNCA re-data um lead existente (antes, membros sem
--     timestamp_opt "nasciam de novo" a cada sync).
--   status: nunca rebaixa — quente/convertido/perdido (do Unnichat/Eduzz)
--     prevalecem; lista_espera não volta a frio só porque a tag mudou.
--   extra: mescla chaves (campos do CRM sobrevivem) e UNE as tags das duas
--     fontes, em vez de substituir o objeto inteiro.
create or replace function public.upsert_mailchimp_leads(p_rows jsonb)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.leads (mailchimp_id, email, name, created_at, status, extra, updated_at)
  select
    r->>'mailchimp_id',
    r->>'email',
    nullif(r->>'name',''),
    coalesce(nullif(r->>'created_at','')::date, current_date),
    coalesce(nullif(r->>'status',''), 'frio'),
    coalesce(r->'extra', '{}'::jsonb),
    now()
  from jsonb_array_elements(p_rows) r
  where coalesce(r->>'mailchimp_id','') <> ''
  on conflict (mailchimp_id) do update set
    email = coalesce(excluded.email, leads.email),
    name = coalesce(excluded.name, leads.name),
    created_at = leads.created_at,
    status = case
      when leads.status in ('quente', 'convertido', 'perdido') then leads.status
      when leads.status = 'lista_espera' and excluded.status = 'frio' then leads.status
      else excluded.status
    end,
    extra = coalesce(leads.extra, '{}'::jsonb)
         || coalesce(excluded.extra, '{}'::jsonb)
         || jsonb_build_object('tags', (
              select coalesce(jsonb_agg(distinct t), '[]'::jsonb) from (
                select jsonb_array_elements_text(coalesce(leads.extra->'tags', '[]'::jsonb)) as t
                union
                select jsonb_array_elements_text(coalesce(excluded.extra->'tags', '[]'::jsonb))
              ) u
            )),
    updated_at = now();
$$;

-- ---------- 3) Chargeback é um status válido de venda ----------

alter table public.sales drop constraint if exists sales_status_check;
alter table public.sales add constraint sales_status_check
  check (status in ('paga', 'reembolsada', 'chargeback'));

-- ---------- 4) ad_spend: campaign NULL não pode duplicar ----------

alter table public.ad_spend drop constraint if exists ad_spend_date_platform_campaign_key;
alter table public.ad_spend add constraint ad_spend_date_platform_campaign_key
  unique nulls not distinct (date, platform, campaign);
