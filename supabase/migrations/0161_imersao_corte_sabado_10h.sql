-- Corte da turma às 10h de sábado também no gasto (Fernando, 28/11 às 9h38:
-- "o painel tá contando como se já tivesse rolando tráfego pro próximo
-- lançamento. É só depois das 10:00").
--
-- A venda já trocava de turma no sábado 10h (turmaParaCompra, HORA_CORTE_SABADO
-- em src/lib/imersao.ts), mas o custo trocava à meia-noite: o placar e o ROAS
-- pegavam o gasto CDR do sábado anterior até a sexta (dia-calendário inteiro) e
-- os modelos de WhatsApp de T-7 a T+1. Resultado, toda semana:
--   - o gasto da manhã do sábado do evento (campanhas "[JA E SABADO]", que
--     vendem a turma do dia) ia pra turma seguinte;
--   - os modelos do fim de semana do evento (cronograma, hoje 10h, domingo
--     9h15, encerramento) contavam na turma do evento E na seguinte.
--
-- Agora há um corte só, imersao_corte(T) = sábado T às 10h em SP, e:
--   Meta: turma T fica com o gasto de imersao_corte(T-7) a imersao_corte(T).
--     O Meta dá o gasto por hora (fuso da conta = America/Sao_Paulo), então o
--     sábado se divide: antes das 10h -> turma do dia; depois -> a seguinte.
--     meta_campanha_hora guarda as horas dos sábados (sync_meta_campanhas_hora).
--   WhatsApp: cada dia cai numa turma só. Modelos do evento e da venda: segunda
--     T-5 a domingo T+1. Confirmação de compra: domingo T-6 a sábado T. Oferta
--     pós-Imersão (a5e_...): domingo T+1 e segunda T+2.
--   Pós-Imersão: vendas a partir de sábado 10h (antes era sábado 0h).
--   Lista de turmas: a turma T aparece quando começa a vender (corte de T-7).
--
-- Depois de aplicar, uma vez, pra ler as horas dos sábados antigos (sem isso,
-- sábado antigo continua indo inteiro pra turma seguinte, como antes):
--   select public.sync_meta_campanhas_hora(120);

-- ---------- o corte ----------

-- Mesma regra do HORA_CORTE_SABADO (src/lib/imersao.ts). Mudou lá, muda aqui.
create or replace function public.imersao_corte(p_turma date)
returns timestamptz
language sql
immutable
set search_path to 'public'
as $$
  select (p_turma + time '10:00') at time zone 'America/Sao_Paulo';
$$;

-- ---------- gasto por hora dos sábados ----------

create table if not exists public.meta_campanha_hora (
  data date not null,
  hora smallint not null check (hora between 0 and 23),
  campanha_id text not null,
  campanha text,
  conta text,
  gasto numeric not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (data, hora, campanha_id)
);
alter table public.meta_campanha_hora enable row level security;

-- Lê na Graph API o gasto por hora (fuso da conta) dos sábados entre hoje -
-- p_dias e hoje. Só o sábado se divide entre duas turmas, então só ele precisa
-- de hora. Mesmo token do Vault da sync_meta_campanhas; só leitura.
create or replace function public.sync_meta_campanhas_hora(p_dias int default 2)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  v_token text; v_accounts text; v_account text;
  v_url text; v_resp jsonb; v_pag int; v_n int; v_linhas int := 0;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date;
  v_dias date[] := '{}';
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'meta_ads_token';
  select decrypted_secret into v_accounts from vault.decrypted_secrets where name = 'meta_ads_account';
  if v_token is null or v_accounts is null then
    raise exception 'token/conta da Meta ausentes no Vault';
  end if;

  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '15000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '40000');

  for v_dia in
    select d::date from generate_series(v_hoje - p_dias, v_hoje, interval '1 day') d
    where extract(dow from d) = 6
  loop
    v_dias := v_dias || v_dia;
    foreach v_account in array string_to_array(replace(v_accounts, ' ', ''), ',') loop
      continue when coalesce(v_account, '') = '';
      v_url := 'https://graph.facebook.com/v21.0/' || v_account || '/insights'
        || '?level=campaign&fields=campaign_id,campaign_name,spend'
        || '&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone&limit=500&time_range='
        || extensions.urlencode(jsonb_build_object('since', v_dia, 'until', v_dia)::text)
        || '&access_token=' || v_token;
      v_pag := 0;
      while v_url is not null and v_pag < 10 loop
        v_resp := (extensions.http_get(v_url)).content::jsonb;
        if v_resp ? 'error' then
          raise exception 'Graph API (conta final %): %', right(v_account, 4), v_resp->'error'->>'message';
        end if;
        insert into public.meta_campanha_hora (data, hora, campanha_id, campanha, conta, gasto, atualizado_em)
        select v_dia,
               left(d->>'hourly_stats_aggregated_by_advertiser_time_zone', 2)::smallint,
               d->>'campaign_id',
               d->>'campaign_name',
               v_account,
               coalesce((d->>'spend')::numeric, 0),
               now()
        from jsonb_array_elements(coalesce(v_resp->'data', '[]'::jsonb)) d
        where d->>'hourly_stats_aggregated_by_advertiser_time_zone' ~ '^\d{2}:'
        on conflict (data, hora, campanha_id) do update
          set campanha = excluded.campanha,
              conta = excluded.conta,
              gasto = excluded.gasto,
              atualizado_em = now();
        get diagnostics v_n = row_count;
        v_linhas := v_linhas + v_n;
        v_url := v_resp->'paging'->>'next';
        v_pag := v_pag + 1;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'linhas', v_linhas, 'sabados', to_jsonb(v_dias));
end;
$$;

revoke all on function public.sync_meta_campanhas_hora(int) from public, anon, authenticated;

-- Dois minutos depois da sync diária, no mesmo ritmo (sábado e domingo; nos
-- outros dias não há sábado na janela e a função não chama a API).
select cron.unschedule('sync-meta-campanhas-hora')
where exists (select 1 from cron.job where jobname = 'sync-meta-campanhas-hora');
select cron.schedule('sync-meta-campanhas-hora', '9,39 * * * *',
  $$ select public.sync_meta_campanhas_hora() $$);

-- ---------- gasto CDR da turma, por dia ----------

-- Dias de domingo a sexta inteiros; o sábado anterior só depois das 10h e o
-- sábado do evento só antes das 10h. A parte "antes das 10h" do sábado vem da
-- leitura por hora; sem ela, se a leitura diária é de antes das 10h o dia todo
-- ainda é manhã, senão (sábado antigo sem hora lida) vai inteiro pra turma
-- seguinte, como era antes. Cliques, checkouts e compras se dividem na mesma
-- proporção do gasto.
create or replace function public.imersao_meta_dias(p_turma date)
returns table (
  dia date,
  gasto numeric,
  gasto_sem_imposto numeric,
  cliques int,
  checkouts int,
  compras int,
  atualizado_em timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with base as (
    select data dia, sum(gasto) g, sum(cliques_link) cl, sum(checkouts) ck, sum(compras) cp,
           max(atualizado_em) at
    from meta_campanha_diario
    where campanha ilike 'CDR%' and data between p_turma - 7 and p_turma
    group by data
  ),
  hora as (
    select data dia, coalesce(sum(gasto) filter (where hora < 10), 0) antes, count(*) n
    from meta_campanha_hora
    where campanha ilike 'CDR%' and data in (p_turma - 7, p_turma)
    group by data
  ),
  manha as (
    -- gasto da manhã (antes das 10h) de cada sábado da janela
    select b.*,
           case
             when h.n > 0 then least(h.antes, b.g)
             when b.at <= imersao_corte(b.dia) then b.g
             else 0
           end antes
    from base b left join hora h using (dia)
  ),
  parte as (
    select m.*,
           case
             when m.dia = p_turma - 7 then m.g - m.antes
             when m.dia = p_turma then m.antes
             else m.g
           end parte
    from manha m
  )
  select dia,
         round(parte * 1.1215, 2),
         round(parte, 2),
         case when g > 0 then round(cl * parte / g)::int else 0 end,
         case when g > 0 then round(ck * parte / g)::int else 0 end,
         case when g > 0 then round(cp * parte / g)::int else 0 end,
         at
  from parte
  where parte > 0 or dia between p_turma - 6 and p_turma - 1;
$$;

revoke all on function public.imersao_meta_dias(date) from public, anon, authenticated;

-- ---------- placar ----------

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
  -- gasto com os 12,15% de impostos da Meta, cortado no sábado 10h
  meta as (
    select dia, gasto, gasto_sem_imposto, cliques, checkouts, compras, atualizado_em
    from imersao_meta_dias(p_turma)
  ),
  dias as (
    select generate_series(p_turma - 6, p_turma - 1, interval '1 day')::date dia
    union
    select dia from meta
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
               'gasto_sem_imposto', coalesce(m.gasto_sem_imposto, 0),
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

-- ---------- ROAS por turma ----------

create or replace function public.imersao_roas(p_turma date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ini timestamptz := imersao_corte(p_turma);
  v_fim timestamptz := ((p_turma + 3)::timestamp at time zone 'America/Sao_Paulo');
  v_placar jsonb := imersao_placar(p_turma);
  v_ing_n int;
  v_ing_bruto numeric;
  v_ing_liq numeric;
  v_meta numeric;
  v_pos jsonb;
  v_pos_bruto numeric;
  v_pos_taxa numeric;
  v_wa numeric;
  v_aliq numeric;
  v_bruto numeric;
  v_taxas numeric;
  v_imposto numeric;
  v_receita numeric;
  v_custo numeric;
begin
  select coalesce(sum((d->>'ingressos')::int), 0),
         coalesce(sum((d->>'bruto')::numeric), 0),
         coalesce(sum((d->>'liquido')::numeric), 0),
         coalesce(sum((d->>'gasto')::numeric), 0)
    into v_ing_n, v_ing_bruto, v_ing_liq, v_meta
  from jsonb_array_elements(v_placar->'dias') d;

  with emails as (
    select distinct lower(email) e from imersao_compradores
    where turma_data = p_turma and status = 'pago' and email is not null
  ),
  pos as (
    select s.product,
           coalesce(s.preco, s.amount)::numeric bruto,
           coalesce((r.data->'total'->>'value')::numeric - (r.data->'netGain'->>'value')::numeric, 0) taxa
    from sales s
    left join eduzz_sales_raw r on r.id::text = s.eduzz_invoice_id::text
    where s.status = 'paga'
      and s.created_at >= v_ini and s.created_at < v_fim
      and (lower(s.buyer_email) in (select e from emails) or s.utm->>'campaign' = 'imersao-semanal')
  )
  select coalesce((select jsonb_agg(jsonb_build_object('produto', product, 'n', n, 'bruto', bruto) order by bruto desc)
                   from (select product, count(*) n, sum(bruto) bruto from pos group by 1) x), '[]'::jsonb),
         coalesce(sum(bruto), 0),
         coalesce(sum(taxa), 0)
    into v_pos, v_pos_bruto, v_pos_taxa
  from pos;

  -- Cada dia de modelo cai numa turma só (as janelas de turmas vizinhas se
  -- encostam sem sobrepor).
  with cambio as (
    select d::date dia,
           (select c.venda from cambio_usd_brl c where c.dia <= d::date order by c.dia desc limit 1) venda
    from generate_series(p_turma - 8, p_turma + 3, interval '1 day') d
  )
  select coalesce(sum(t.custo * case when w.moeda = 'USD' then coalesce(x.venda, 0) else 1 end), 0)
    into v_wa
  from whatsapp_template_diario t
  join whatsapp_wabas w using (waba_id)
  left join whatsapp_templates m using (template_id)
  left join cambio x on x.dia = t.dia
  where (m.nome ilike '%imersao%' and m.nome ilike '%confirmacao%' and t.dia between p_turma - 6 and p_turma)
     or (m.nome ilike '%imersao%' and m.nome not ilike '%confirmacao%' and t.dia between p_turma - 5 and p_turma + 1)
     or (m.nome ilike 'a5e\_%' and t.dia between p_turma + 1 and p_turma + 2);

  select coalesce(aliquota_simples, 0) into v_aliq from politica_caixa where id = 1;
  v_aliq := coalesce(v_aliq, 0);

  v_bruto := v_ing_bruto + v_pos_bruto;
  v_taxas := greatest(v_ing_bruto - v_ing_liq, 0) + v_pos_taxa;
  v_imposto := round(v_bruto * v_aliq, 2);
  v_receita := v_bruto - v_taxas - v_imposto;
  v_custo := v_meta + v_wa;

  return jsonb_build_object(
    'turma', p_turma,
    'fechada', now() >= v_fim,
    'ingressos', v_ing_n,
    'ingressos_bruto', round(v_ing_bruto, 2),
    'pos', v_pos,
    'pos_bruto', round(v_pos_bruto, 2),
    'bruto', round(v_bruto, 2),
    'taxas_eduzz', round(v_taxas, 2),
    'aliquota', v_aliq,
    'imposto', v_imposto,
    'receita_liquida', round(v_receita, 2),
    'meta', round(v_meta, 2),
    'whatsapp', round(v_wa, 2),
    'custo', round(v_custo, 2),
    'lucro', round(v_receita - v_custo, 2),
    'roas', case when v_custo > 0 then round(v_receita / v_custo, 2) else null end
  );
end;
$$;

revoke all on function public.imersao_roas(date) from public, anon, authenticated;

-- As turmas que já começaram a vender (corte da turma anterior já passou).
create or replace function public.imersao_roas_turmas(p_n int default 8)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(public.imersao_roas(turma_data) order by turma_data desc), '[]'::jsonb)
  from (
    select turma_data from imersao_turmas
    where imersao_corte(turma_data - 7) <= now()
    order by turma_data desc
    limit p_n
  ) t;
$$;

revoke all on function public.imersao_roas_turmas(int) from public, anon, authenticated;
