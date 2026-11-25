-- Custo dos envios do WhatsApp (API oficial), direto da Meta (Fernando, 25/11:
-- "tenho pouquíssima visibilidade de quanto estamos gastando de envios: API
-- oficial de whatsapp e tal. Queria um painel disso também. Separado do
-- tráfego").
--
-- A fonte é a própria Meta, pelo token do WhatsApp que já está no Vault
-- (whatsapp_graph): o painel não estima nada, lê o que a Meta cobra.
--   · pricing_analytics de cada conta (WABA): mensagens e custo por dia,
--     por categoria (marketing, utilidade, autenticação, atendimento). É o
--     total cobrado. Dia de Brasília.
--   · template_analytics: enviadas, entregues, lidas, cliques e custo por
--     modelo de mensagem e por dia (dia UTC, como a Meta entrega). É o que
--     permite saber QUEM gastou (Téo, ondas, Foley, lançamentos...).
-- As contas (WABAs) vêm da empresa dona do número do suporte. As de USD são
-- cobradas em dólar: o painel converte pela PTAX de venda do dia (Banco
-- Central), sem IOF nem spread do cartão.
--
-- Atualiza a cada 3 h (pg_cron), relendo os últimos 4 dias (a Meta ainda
-- ajusta o custo nos dias recentes).

create table if not exists public.whatsapp_wabas (
  waba_id text primary key,
  nome text,
  numero text,
  moeda text,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.whatsapp_templates (
  template_id text primary key,
  waba_id text not null,
  nome text not null,
  categoria text,
  status text,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.whatsapp_custo_diario (
  dia date not null,            -- dia de Brasília
  waba_id text not null,
  categoria text not null,      -- MARKETING, UTILITY, AUTHENTICATION, SERVICE...
  tipo text not null,           -- REGULAR, FREE_CUSTOMER_SERVICE, FREE_ENTRY_POINT...
  volume integer not null default 0,
  custo numeric(14,4) not null default 0,  -- na moeda da conta (whatsapp_wabas.moeda)
  atualizado_em timestamptz not null default now(),
  primary key (dia, waba_id, categoria, tipo)
);

create table if not exists public.whatsapp_template_diario (
  dia date not null,            -- dia UTC (é como o template_analytics entrega)
  waba_id text not null,
  template_id text not null,
  enviados integer not null default 0,
  entregues integer not null default 0,
  lidos integer not null default 0,
  cliques integer not null default 0,
  custo numeric(14,4) not null default 0,  -- na moeda da conta
  atualizado_em timestamptz not null default now(),
  primary key (dia, waba_id, template_id)
);

create table if not exists public.cambio_usd_brl (
  dia date primary key,
  venda numeric(10,5) not null,  -- PTAX de venda do Banco Central
  atualizado_em timestamptz not null default now()
);

alter table public.whatsapp_wabas enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_custo_diario enable row level security;
alter table public.whatsapp_template_diario enable row level security;
alter table public.cambio_usd_brl enable row level security;
revoke all on public.whatsapp_wabas, public.whatsapp_templates, public.whatsapp_custo_diario,
  public.whatsapp_template_diario, public.cambio_usd_brl from anon, authenticated;

-- ── Sincronização ───────────────────────────────────────────────────────────
-- p_de/p_ate em dias de Brasília. Janelas de 7 dias por chamada à Meta (o
-- template_analytics aceita até 10 modelos por pedido e pagina os pontos).

create or replace function public.sync_whatsapp_custos(p_de date, p_ate date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_ate date := coalesce(p_ate, (now() at time zone 'America/Sao_Paulo')::date);
  v_biz text;
  v_resp jsonb;
  v_w jsonb;
  v_waba text;
  v_caminho text;
  v_pag int;
  v_ini date;
  v_fim date;
  v_ids text[];
  v_lote int;
  n_contas int := 0;
  n_custo int := 0;
  n_tpl int := 0;
  n int;
  v_erros text[] := '{}';
begin
  perform http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '10000');
  perform http_set_curlopt('CURLOPT_TIMEOUT_MS', '30000');

  -- Contas: as WABAs da empresa dona do número do suporte.
  v_resp := whatsapp_graph('GET', '{waba}?fields=owner_business_info', null);
  v_biz := v_resp->'owner_business_info'->>'id';
  if v_biz is null then
    raise exception 'Graph (empresa): %', coalesce(v_resp->'error'->>'message', v_resp::text);
  end if;
  v_resp := whatsapp_graph('GET', v_biz || '/owned_whatsapp_business_accounts?fields=id,name,currency,phone_numbers{display_phone_number}&limit=50', null);
  if v_resp ? 'error' then
    raise exception 'Graph (contas): %', v_resp->'error'->>'message';
  end if;
  for v_w in select x from jsonb_array_elements(v_resp->'data') x loop
    insert into whatsapp_wabas (waba_id, nome, numero, moeda, atualizado_em)
    values (v_w->>'id', v_w->>'name', v_w->'phone_numbers'->'data'->0->>'display_phone_number', v_w->>'currency', now())
    on conflict (waba_id) do update
      set nome = excluded.nome, numero = excluded.numero, moeda = excluded.moeda, atualizado_em = now();
    n_contas := n_contas + 1;
  end loop;

  for v_waba in select waba_id from whatsapp_wabas loop
    -- Modelos da conta (pra saber nome e categoria de cada id).
    begin
      v_caminho := v_waba || '/message_templates?fields=id,name,category,status&limit=100';
      v_pag := 0;
      while v_caminho is not null and v_pag < 20 loop
        v_resp := whatsapp_graph('GET', v_caminho, null);
        if v_resp ? 'error' then
          raise exception '%', v_resp->'error'->>'message';
        end if;
        insert into whatsapp_templates (template_id, waba_id, nome, categoria, status, atualizado_em)
        select x->>'id', v_waba, x->>'name', x->>'category', x->>'status', now()
        from jsonb_array_elements(v_resp->'data') x
        on conflict (template_id) do update
          set waba_id = excluded.waba_id, nome = excluded.nome, categoria = excluded.categoria,
              status = excluded.status, atualizado_em = now();
        v_caminho := case when v_resp->'paging'->'cursors'->>'after' is not null and v_resp->'paging'->>'next' is not null
          then v_waba || '/message_templates?fields=id,name,category,status&limit=100&after=' || (v_resp->'paging'->'cursors'->>'after')
          end;
        v_pag := v_pag + 1;
      end loop;
    exception when others then
      v_erros := v_erros || (v_waba || ' modelos: ' || sqlerrm);
    end;

    v_ini := p_de;
    while v_ini <= v_ate loop
      v_fim := least(v_ini + 6, v_ate);

      -- Custo total por dia e categoria (o que a Meta cobra).
      begin
        v_resp := whatsapp_graph('GET', v_waba || '?fields=pricing_analytics'
          || '.start(' || extract(epoch from (v_ini::timestamp at time zone 'America/Sao_Paulo'))::bigint || ')'
          || '.end(' || least(extract(epoch from ((v_fim + 1)::timestamp at time zone 'America/Sao_Paulo')), extract(epoch from now()))::bigint || ')'
          || '.granularity(DAILY).dimensions(["PRICING_CATEGORY","PRICING_TYPE"])', null);
        if v_resp ? 'error' then
          raise exception '%', v_resp->'error'->>'message';
        end if;
        insert into whatsapp_custo_diario (dia, waba_id, categoria, tipo, volume, custo, atualizado_em)
        select (to_timestamp((p->>'start')::bigint) at time zone 'America/Sao_Paulo')::date, v_waba,
               coalesce(p->>'pricing_category', '?'), coalesce(p->>'pricing_type', '?'),
               sum(coalesce((p->>'volume')::int, 0)), sum(coalesce((p->>'cost')::numeric, 0)), now()
        from jsonb_array_elements(v_resp->'pricing_analytics'->'data') d,
             jsonb_array_elements(d->'data_points') p
        group by 1, 2, 3, 4
        on conflict (dia, waba_id, categoria, tipo) do update
          set volume = excluded.volume, custo = excluded.custo, atualizado_em = now();
        get diagnostics n = row_count;
        n_custo := n_custo + n;
      exception when others then
        v_erros := v_erros || (v_waba || ' custo ' || v_ini || ': ' || sqlerrm);
      end;

      -- Por modelo: de 10 em 10 (limite da Meta), seguindo a paginação. A Meta
      -- só guarda os últimos 90 dias por modelo.
      v_ids := null;
      if v_fim >= current_date - 88 then
        select array_agg(template_id order by template_id) into v_ids
        from whatsapp_templates where waba_id = v_waba;
      end if;
      v_lote := 1;
      while v_ids is not null and v_lote <= array_length(v_ids, 1) loop
        begin
          v_caminho := v_waba || '/template_analytics?granularity=DAILY'
            || '&start=' || extract(epoch from (greatest(v_ini, current_date - 88)::timestamp at time zone 'UTC'))::bigint
            || '&end=' || least(extract(epoch from ((v_fim + 1)::timestamp at time zone 'UTC')), extract(epoch from now()))::bigint
            || '&metric_types=["SENT","DELIVERED","READ","CLICKED","COST"]'
            || '&template_ids=[' || array_to_string(v_ids[v_lote:v_lote + 9], ',') || ']&limit=1000';
          v_pag := 0;
          while v_caminho is not null and v_pag < 10 loop
            v_resp := whatsapp_graph('GET', v_caminho, null);
            if v_resp ? 'error' then
              raise exception '%', v_resp->'error'->>'message';
            end if;
            insert into whatsapp_template_diario (dia, waba_id, template_id, enviados, entregues, lidos, cliques, custo, atualizado_em)
            select (to_timestamp((p->>'start')::bigint) at time zone 'UTC')::date, v_waba, p->>'template_id',
                   coalesce((p->>'sent')::int, 0), coalesce((p->>'delivered')::int, 0), coalesce((p->>'read')::int, 0),
                   coalesce((select sum((c->>'count')::int) from jsonb_array_elements(case when jsonb_typeof(p->'clicked') = 'array' then p->'clicked' else '[]'::jsonb end) c where c->>'type' = 'url_button'), 0),
                   coalesce((select (c->>'value')::numeric from jsonb_array_elements(case when jsonb_typeof(p->'cost') = 'array' then p->'cost' else '[]'::jsonb end) c where c->>'type' = 'amount_spent' limit 1), 0),
                   now()
            from jsonb_array_elements(v_resp->'data') d,
                 jsonb_array_elements(d->'data_points') p
            where coalesce((p->>'sent')::int, 0) > 0 or coalesce((p->>'read')::int, 0) > 0
               or coalesce((select (c->>'value')::numeric from jsonb_array_elements(case when jsonb_typeof(p->'cost') = 'array' then p->'cost' else '[]'::jsonb end) c where c->>'type' = 'amount_spent' limit 1), 0) > 0
            on conflict (dia, waba_id, template_id) do update
              set enviados = excluded.enviados, entregues = excluded.entregues, lidos = excluded.lidos,
                  cliques = excluded.cliques, custo = excluded.custo, atualizado_em = now();
            get diagnostics n = row_count;
            n_tpl := n_tpl + n;
            v_caminho := case when v_resp->'paging'->>'next' is not null and v_resp->'paging'->'cursors'->>'after' is not null
              then regexp_replace(v_caminho, '&after=[^&]*', '') || '&after=' || (v_resp->'paging'->'cursors'->>'after')
              end;
            v_pag := v_pag + 1;
          end loop;
        exception when others then
          v_erros := v_erros || (v_waba || ' modelos ' || v_ini || ': ' || sqlerrm);
        end;
        v_lote := v_lote + 10;
      end loop;

      v_ini := v_fim + 1;
    end loop;
  end loop;

  -- Dólar: PTAX de venda (Banco Central). Fim de semana e feriado usam o
  -- último dia útil (a consulta do painel resolve).
  begin
    v_resp := (http_get(
      'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)'
      || '?@dataInicial=%27' || to_char(p_de - 7, 'MM-DD-YYYY') || '%27'
      || '&@dataFinalCotacao=%27' || to_char(v_ate, 'MM-DD-YYYY') || '%27'
      || '&$format=json&$select=cotacaoVenda,dataHoraCotacao')).content::jsonb;
    insert into cambio_usd_brl (dia, venda, atualizado_em)
    select (x->>'dataHoraCotacao')::timestamp::date, (x->>'cotacaoVenda')::numeric, now()
    from jsonb_array_elements(v_resp->'value') x
    on conflict (dia) do update set venda = excluded.venda, atualizado_em = now();
  exception when others then
    v_erros := v_erros || ('PTAX: ' || sqlerrm);
  end;

  insert into webhook_log (source, note, body)
  values ('whatsapp_custos',
          case when cardinality(v_erros) = 0 then 'ok' else 'erro' end,
          jsonb_build_object('de', p_de, 'ate', v_ate, 'contas', n_contas, 'linhas_custo', n_custo,
                             'linhas_modelo', n_tpl, 'erros', to_jsonb(v_erros)));

  return jsonb_build_object('ok', cardinality(v_erros) = 0, 'contas', n_contas, 'linhas_custo', n_custo,
                            'linhas_modelo', n_tpl, 'erros', to_jsonb(v_erros));
end;
$$;

revoke all on function public.sync_whatsapp_custos(date, date) from public, anon, authenticated;

-- ── De quem é cada modelo ───────────────────────────────────────────────────
-- Os ids que o Téo e as ondas usam vêm da config (mudou lá, muda aqui); o
-- resto do número do Unnichat pelo nome do modelo. Os outros números (suporte,
-- atendimento) aparecem pelo nome da conta.

create or replace function public.whatsapp_template_origem(p_template_id text, p_nome text, p_waba_nome text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when coalesce(p_waba_nome, '') not ilike '%unnichat%' then coalesce(p_waba_nome, 'Outro número')
    when p_template_id in (
      select jsonb_array_elements_text(coalesce(c.followup_templates, '[]'::jsonb)) from teo_config c
      union all select c.template_abertura_id from teo_config c
      union all select c.template_lembrete_id from teo_config c
      union all select c.template_liberada_id from teo_config c
    ) then 'Téo (abertura, lembrete e acompanhamento)'
    when p_template_id in (select template_id from campanha_templates) then 'Ondas de alunos'
    when p_nome ~ '^(renova_|atraso_|saida_)' then 'Foley (renovação, atraso e saída)'
    when p_nome ~ '(black|bf2026|ingresso_)' then 'Black Friday e ingressos'
    when p_nome ~ '(imersao|estamos_ao_vivo|sala_vip|salavip|ao_vivo|live|encontro|almoco|coffee|cronograma|credenciamento|retratos|pesquisa_|mensagem_08h|lembrete_8h)' then 'Imersão, lives e eventos'
    when p_nome ~ '^(iniciar_interacao|reativar_|retomada_contato|tentativa_de_contato|follow|cta___call|convite_de_call|confirmacao_de_call|lembrete_call|cobrar_retorno|template_direto|atendimento_)' then 'Vendedores (Unnichat)'
    when p_nome ~ '^(a5e_|adz_|inscricoes_abertas|recuperacao_|comprou_|lead_frio|airbnb_do_zero|upgrade_|gigantes_|promo_|piloto_|seu_imovel|aluno_|max_|boas_vindas|resposta_de_formulario|escopo_|confirmacao_|compra_)' then 'Lançamentos, recuperação e alunos'
    else 'Outros'
  end;
$$;

-- ── Leitura do painel (/custos/whatsapp) ────────────────────────────────────
-- Tudo convertido pra real pela PTAX do dia (ou do último dia útil antes).

create or replace function public.painel_whatsapp_custos(p_de date, p_ate date)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with cambio as (
    select d::date dia,
           (select c.venda from cambio_usd_brl c where c.dia <= d::date order by c.dia desc limit 1) venda
    from generate_series(p_de - 1, p_ate, interval '1 day') d
  ),
  dias as (
    select c.dia, c.waba_id, c.categoria, c.tipo, sum(c.volume) volume, sum(c.custo) custo,
           sum(c.custo * case when w.moeda = 'USD' then coalesce(x.venda, 0) else 1 end) custo_brl
    from whatsapp_custo_diario c
    join whatsapp_wabas w using (waba_id)
    left join cambio x on x.dia = c.dia
    where c.dia between p_de and p_ate
    group by 1, 2, 3, 4
  ),
  modelos as (
    select t.waba_id, t.template_id, coalesce(m.nome, t.template_id) nome, m.categoria,
           whatsapp_template_origem(t.template_id, m.nome, w.nome) origem,
           sum(t.enviados) enviados, sum(t.entregues) entregues, sum(t.lidos) lidos, sum(t.cliques) cliques,
           sum(t.custo) custo,
           sum(t.custo * case when w.moeda = 'USD' then coalesce(x.venda, 0) else 1 end) custo_brl
    from whatsapp_template_diario t
    join whatsapp_wabas w using (waba_id)
    left join whatsapp_templates m using (template_id)
    left join cambio x on x.dia = t.dia
    where t.dia between p_de and p_ate
    group by 1, 2, 3, 4, 5
  )
  select jsonb_build_object(
    'contas', (select coalesce(jsonb_agg(jsonb_build_object('waba_id', waba_id, 'nome', nome, 'numero', numero, 'moeda', moeda) order by nome), '[]'::jsonb) from whatsapp_wabas),
    'dias', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'waba_id', waba_id, 'categoria', categoria, 'tipo', tipo,
               'volume', volume, 'custo', round(custo, 4), 'custo_brl', round(custo_brl, 2)) order by dia), '[]'::jsonb) from dias),
    'modelos', (select coalesce(jsonb_agg(jsonb_build_object('waba_id', waba_id, 'template_id', template_id, 'nome', nome,
               'categoria', categoria, 'origem', origem, 'enviados', enviados, 'entregues', entregues, 'lidos', lidos,
               'cliques', cliques, 'custo', round(custo, 4), 'custo_brl', round(custo_brl, 2)) order by custo_brl desc), '[]'::jsonb) from modelos),
    'cambio_hoje', (select jsonb_build_object('dia', dia, 'venda', venda) from cambio_usd_brl order by dia desc limit 1),
    'atualizado_em', (select max(atualizado_em) from whatsapp_custo_diario),
    'ultima_sync', (select jsonb_build_object('em', created_at, 'note', note, 'erros', body->'erros')
                    from webhook_log where source = 'whatsapp_custos' order by created_at desc limit 1)
  );
$$;

revoke all on function public.painel_whatsapp_custos(date, date) from public, anon, authenticated;
revoke all on function public.whatsapp_template_origem(text, text, text) from public, anon, authenticated;

-- A cada 3 h, relendo os últimos 4 dias. Uma leitura leva uns 2 min (umas 45
-- chamadas à Meta, uma por vez) e o pg_cron corta em 2 min: o timeout vai no
-- próprio comando. O histórico (25/11) foi carregado em pedaços de 21 dias.
select cron.unschedule('whatsapp-custos') where exists (select 1 from cron.job where jobname = 'whatsapp-custos');
select cron.schedule('whatsapp-custos', '23 */3 * * *',
  $$set statement_timeout = '15min'; select public.sync_whatsapp_custos(((now() at time zone 'America/Sao_Paulo')::date - 3))$$);
