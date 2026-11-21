-- Fluxo de saída dos grupos [Membros] A5E e Gigantes, parte do painel (Fernando,
-- 20/11, pedido do Foley):
--  1. Avisos de atraso automáticos: atraso_1, atraso_3 e atraso_6 no 1º, 3º e
--     6º dia de atraso NOVO (vencimento a partir de 18/11), uma vez cada, pro
--     WhatsApp que está no grupo. Quando atraso_1b/3b/6b forem aprovados (botões
--     "Quero regularizar" e "Não quero renovar"), troca-se o id em
--     foley_config.atraso_templates.
--  2. Botão "Não quero renovar": para os avisos e a pessoa passa a vir como
--     sai_agora no /api/foley/situacao (o Foley tira na consulta seguinte e o
--     painel manda o saida_aviso). Se ela pagar depois, volta a valer a regra.
--  3. Botão "Quero regularizar" (ou "sim" ao atraso_3): o painel manda a 2ª via
--     (link da fatura em aberto na Eduzz). Pagou: a regra volta a dar "fica" e
--     os avisos param sozinhos.
-- O painel guarda o WhatsApp de quem o Foley consulta (foley_membros): é pra
-- esse número que vão os avisos.

-- O Téo/painel pode procurar e criar contato no Unnichat (o saida_aviso de 20/11
-- falhou com "Contact not found!" pra quem nunca falou com a gente).
create or replace function public.teo_unnichat(p_method text, p_path text, p_body jsonb default null::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_tok text;
  v_status int;
  v_content text;
  v_ok boolean;
begin
  v_ok := (p_method = 'GET' and (p_path ~ '^/contact/[A-Za-z0-9-]+(/messages|/assign)?$' or p_path ~ '^/attendants(\?[A-Za-z0-9=&]*)?$'))
       or (p_method = 'POST' and (p_path ~ '^/contact/[A-Za-z0-9-]+/(notes|assign|tags)$'
                                  or p_path in ('/meta/messages', '/meta/templates', '/contact', '/contact/search')));
  if not v_ok then
    return jsonb_build_object('status', 400, 'erro', 'caminho não permitido');
  end if;
  -- O que o Téo escreve sai com o token do próprio usuário Téo, se existir
  -- (o Unnichat mostra como autor o dono do token); o resto usa o da conta.
  if p_method = 'POST' then
    select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'unnichat_api_token_teo';
  end if;
  if v_tok is null then
    select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'unnichat_api_token';
  end if;
  if v_tok is null then
    return jsonb_build_object('status', 500, 'erro', 'sem token');
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
  select status, content into v_status, v_content
    from extensions.http((
      p_method,
      'https://unnichat.com.br/api' || p_path,
      array[
        extensions.http_header('Authorization', 'Bearer ' || v_tok),
        extensions.http_header('Accept', 'application/json')
      ],
      case when p_body is null then null else 'application/json' end,
      case when p_body is null then null else p_body::text end
    )::extensions.http_request);
  begin
    return jsonb_build_object('status', v_status, 'body', v_content::jsonb);
  exception when others then
    return jsonb_build_object('status', v_status, 'body', to_jsonb(left(coalesce(v_content, ''), 2000)));
  end;
end;
$function$;

-- Contato do Unnichat pelo telefone (com DDI); cria se não existir. Devolve o id.
create or replace function public.foley_unnichat_contato(p_phone text, p_nome text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  j jsonb;
  v_id text;
begin
  j := public.teo_unnichat('POST', '/contact/search', jsonb_build_object('phone', p_phone));
  v_id := j->'body'->'data'->0->>'id';
  if v_id is not null then
    return v_id;
  end if;
  j := public.teo_unnichat('POST', '/contact', jsonb_build_object('name', coalesce(nullif(trim(p_nome), ''), p_phone), 'phone', p_phone));
  return j->'body'->'data'->>'id';
end;
$function$;
revoke all on function public.foley_unnichat_contato(text, text) from public, anon, authenticated;

-- Número do WhatsApp com DDI: só ganha 55 o que tem cara de número brasileiro
-- sem DDI (11 dígitos com 9 no 3º, ou 10 com 2 a 5 no 3º). Mesma regra do
-- /api/foley/saidas.
create or replace function public.foley_tel_whatsapp(p text)
returns text
language sql
immutable
as $function$
  select case
           when (length(d) = 11 and substr(d, 3, 1) = '9') or (length(d) = 10 and substr(d, 3, 1) between '2' and '5') then '55' || d
           when d ~ '^55' and length(d) between 12 and 13 then d
           when d !~ '^55' and length(d) between 8 and 15 then d
         end
  from (select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^0+', '') d) x;
$function$;

create table if not exists public.foley_membros (
  chave text not null,
  grupo text not null check (grupo in ('a5e', 'gigantes')),
  telefone text not null,
  email text,
  visto_em timestamptz not null default now(),
  primary key (chave, grupo)
);
alter table public.foley_membros enable row level security;

create table if not exists public.foley_atraso_avisos (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  chave text not null,
  grupo text not null,
  telefone text not null,
  nome text,
  vencimento date not null,
  etapa int not null check (etapa in (1, 3, 6)),
  template_id text not null,
  status text not null default 'pendente',
  detalhe text,
  unique (chave, grupo, vencimento, etapa)
);
alter table public.foley_atraso_avisos enable row level security;

create table if not exists public.foley_marcacoes (
  chave text not null,
  grupo text not null,
  decisao text not null default 'sai_agora',
  motivo text not null default 'nao_quer_renovar',
  criado_em timestamptz not null default now(),
  telefone text,
  contact_id text,
  primary key (chave, grupo)
);
alter table public.foley_marcacoes enable row level security;

alter table public.foley_config
  add column if not exists avisos_atraso_ligado boolean not null default true,
  -- ids em uso (aprovados em 20/11) e os novos com os dois botões, em análise
  add column if not exists atraso_templates jsonb not null
    default '{"1": "3654523418034599", "3": "1166735446008453", "6": "1401991175342826"}'::jsonb,
  add column if not exists atraso_templates_b jsonb
    default '{"1": "1494085195991808", "3": "1914289362887827", "6": null}'::jsonb;

-- A decisão sem a pausa: regra + WhatsApp estrangeiro (0138) + botão "Não quero
-- renovar". Não grava nada além do que a regra já grava (foley_situacao_ultima).
create or replace function public.foley_situacao_calc(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '60000'
as $function$
declare
  v jsonb;
  v_alt jsonb;
  v_alt_res jsonb;
begin
  v := public.foley_situacao_regra(p_itens);

  select jsonb_agg(jsonb_build_object(
           'o', b.o,
           'k', k.k,
           'item', jsonb_build_object(
             'telefone', substr(b.d, k.k + 1),
             'grupo', b.x->>'grupo',
             'email', p_itens->((b.o - 1)::int)->>'email'))
         order by b.o, k.k)
    into v_alt
  from (select x, o, regexp_replace(regexp_replace(coalesce(x->>'telefone', ''), '\D', '', 'g'), '^0+', '') d
          from jsonb_array_elements(v) with ordinality a(x, o)) b
  cross join generate_series(1, 3) k(k)
  where b.x->>'decisao' = 'nao_achei'
    and b.d !~ '^55'
    and length(b.d) - k.k >= 10;

  if v_alt is not null then
    v_alt_res := public.foley_situacao_regra(
      (select jsonb_agg(e->'item' order by n) from jsonb_array_elements(v_alt) with ordinality t(e, n)));
    select coalesce(jsonb_agg(coalesce(m.y, b.x) order by b.o), '[]'::jsonb)
      into v
      from jsonb_array_elements(v) with ordinality b(x, o)
      left join lateral (
        select r.y || jsonb_build_object(
                 'telefone', b.x->'telefone',
                 'fonte', coalesce(r.y->>'fonte', '') || ' (número sem o DDI)')
          from jsonb_array_elements(v_alt) with ordinality t(e, n)
          join jsonb_array_elements(v_alt_res) with ordinality r(y, n2) on r.n2 = t.n
         where (t.e->>'o')::bigint = b.o
           and r.y->>'decisao' <> 'nao_achei'
         order by (t.e->>'k')::int
         limit 1
      ) m(y) on true;
  end if;

  -- "Não quero renovar": sai_agora, a não ser que tenha pago depois de tocar no botão.
  select coalesce(jsonb_agg(
           case when m.chave is not null
                 and coalesce(b.x->>'decisao', '') <> 'protegido'
                 and (b.x->>'ultimo_pagamento' is null
                      or (b.x->>'ultimo_pagamento')::date < (m.criado_em at time zone 'America/Sao_Paulo')::date)
             then b.x || jsonb_build_object(
                    'decisao', m.decisao,
                    'decisao_regra', b.x->>'decisao',
                    'motivo', m.motivo,
                    'fonte', 'botão "Não quero renovar" em ' || to_char(m.criado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'))
             else b.x end
           order by b.o), '[]'::jsonb)
    into v
    from jsonb_array_elements(v) with ordinality b(x, o)
    left join public.foley_marcacoes m
      on m.chave = public.assin_chave_tel(b.x->>'telefone') and m.grupo = b.x->>'grupo';

  return v;
end;
$function$;
revoke all on function public.foley_situacao_calc(jsonb) from public, anon, authenticated;

-- A rota do Foley: guarda o WhatsApp de cada um, calcula e aplica a pausa.
create or replace function public.foley_situacao(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '60000'
as $function$
declare
  v jsonb;
  v_pausado boolean;
begin
  insert into public.foley_membros (chave, grupo, telefone, email, visto_em)
  select distinct on (s.k, s.g) s.k, s.g, s.tel, s.email, now()
    from (select public.assin_chave_tel(it->>'telefone') k,
                 case when lower(coalesce(it->>'grupo', '')) like 'gig%' then 'gigantes' else 'a5e' end g,
                 public.foley_tel_whatsapp(it->>'telefone') tel,
                 nullif(lower(trim(it->>'email')), '') email
            from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) it) s
   where s.k is not null and s.tel is not null
  on conflict (chave, grupo) do update
    set telefone = excluded.telefone,
        email = coalesce(excluded.email, public.foley_membros.email),
        visto_em = now();

  v := public.foley_situacao_calc(p_itens);

  select coalesce(pausado, false) into v_pausado from public.foley_config where id = 1;
  if coalesce(v_pausado, false) then
    select coalesce(jsonb_agg(
             case when x->>'decisao' in ('sai', 'sai_agora', 'nao_achei') then
               x || jsonb_build_object(
                 'decisao', 'pausado',
                 'decisao_regra', x->>'decisao',
                 'motivo', 'remoções pausadas pelo Fernando (20/11); pela regra: ' || coalesce(x->>'motivo', ''))
             else x end
             order by o), '[]'::jsonb)
      into v
      from jsonb_array_elements(v) with ordinality a(x, o);
  end if;
  return v;
end;
$function$;
revoke all on function public.foley_situacao(jsonb) from public, anon, authenticated;

-- Primeiro nome do assinante pra saudação ("tudo bem" se não achar).
create or replace function public.foley_primeiro_nome(p_chave text)
returns text
language sql
stable
as $function$
  select coalesce(
    (select initcap(split_part(trim(a.dados->'client'->>'name'), ' ', 1))
       from public.assinaturas_eduzz a
      where public.assin_chave_tel(a.dados->'client'->>'phone') = p_chave
        and coalesce(trim(a.dados->'client'->>'name'), '') !~ '[0-9@]'
        and coalesce(trim(a.dados->'client'->>'name'), '') <> ''
      order by a.proximo_vencimento desc nulls last
      limit 1),
    'tudo bem');
$function$;

-- Avisos de atraso do dia (cron às 10h07 de Brasília).
create or replace function public.foley_enviar_atrasos()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120000'
as $function$
declare
  v_cfg record;
  v jsonb;
  r record;
  j jsonb;
  v_etapa int;
  v_venc date;
  v_tpl text;
  v_nome text;
  v_ok boolean;
  n_env int := 0;
  n_err int := 0;
  v_hora int := extract(hour from now() at time zone 'America/Sao_Paulo');
begin
  select * into v_cfg from public.foley_config where id = 1;
  if not coalesce(v_cfg.avisos_atraso_ligado, false) then
    return jsonb_build_object('ok', true, 'nada', 'avisos de atraso desligados');
  end if;
  if v_hora < 8 or v_hora >= 21 then
    return jsonb_build_object('ok', true, 'nada', 'fora do horário (8h–21h)');
  end if;

  select public.foley_situacao_calc(jsonb_agg(jsonb_build_object('telefone', telefone, 'grupo', grupo, 'email', email)))
    into v
    from public.foley_membros
   where visto_em >= now() - interval '3 days';
  if v is null then
    return jsonb_build_object('ok', true, 'nada', 'nenhum membro consultado nos últimos 3 dias');
  end if;

  for r in
    select m.chave, m.grupo, m.telefone, (x->>'dias_atraso')::int d
      from jsonb_array_elements(v) x
      join public.foley_membros m
        on m.chave = public.assin_chave_tel(x->>'telefone') and m.grupo = x->>'grupo'
     where x->>'decisao' = 'fica'
       and x->>'motivo' ~ '^atraso_[0-9]+_dias$'
       and (x->>'dias_atraso')::int between 1 and 6
  loop
    v_etapa := case when r.d >= 6 then 6 when r.d >= 3 then 3 else 1 end;
    v_venc := current_date - r.d;
    -- quem tocou em "Não quero renovar" já vem como sai_agora (não passa no filtro "fica")
    continue when exists (select 1 from public.foley_atraso_avisos a
                           where a.chave = r.chave and a.grupo = r.grupo and a.vencimento = v_venc and a.etapa >= v_etapa);
    v_tpl := v_cfg.atraso_templates->>(v_etapa::text);
    continue when v_tpl is null;
    v_nome := public.foley_primeiro_nome(r.chave);

    insert into public.foley_atraso_avisos (chave, grupo, telefone, nome, vencimento, etapa, template_id)
    values (r.chave, r.grupo, r.telefone, v_nome, v_venc, v_etapa, v_tpl)
    on conflict do nothing;

    perform public.foley_unnichat_contato(r.telefone, nullif(v_nome, 'tudo bem'));
    j := public.teo_unnichat('POST', '/meta/templates', jsonb_build_object(
      'phone', r.telefone,
      'templateId', v_tpl,
      'bodyParameters', jsonb_build_array(
        jsonb_build_object('type', 'text', 'text', v_nome),
        jsonb_build_object('type', 'text', 'text', case r.grupo when 'gigantes' then 'Gigantes da Temporada' else 'Anfitrião 5 Estrelas' end))));
    v_ok := coalesce((j->>'status')::int, 0) between 200 and 299;
    update public.foley_atraso_avisos
       set status = case when v_ok then 'enviado' else 'erro' end,
           detalhe = case when v_ok then null else coalesce(j->>'status', '') || ' ' || left(coalesce((j->'body')::text, j->>'erro', ''), 200) end
     where chave = r.chave and grupo = r.grupo and vencimento = v_venc and etapa = v_etapa;
    if v_ok then n_env := n_env + 1; else n_err := n_err + 1; end if;
  end loop;

  insert into public.webhook_log (source, note, body)
  values ('foley', 'avisos de atraso', jsonb_build_object('enviados', n_env, 'erros', n_err));
  return jsonb_build_object('ok', true, 'enviados', n_env, 'erros', n_err);
end;
$function$;
revoke all on function public.foley_enviar_atrasos() from public, anon, authenticated;

-- Resposta a um aviso de atraso (botões). Chamado pela fila do Unnichat antes do
-- Téo: se a pessoa recebeu aviso de atraso nos últimos 10 dias e tocou num botão,
-- o painel trata aqui e o Téo não entra. Qualquer outra mensagem segue o fluxo normal.
create or replace function public.foley_botao(p_contact_id text, p_phone text, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_chave text := public.assin_chave_tel(p_phone);
  v_t text := trim(translate(lower(coalesce(p_texto, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'));
  v_av record;
  v_link text;
  v_prod text;
  v_tel text := public.foley_tel_whatsapp(p_phone);
  j jsonb;
begin
  if v_chave is null or v_t = '' then
    return jsonb_build_object('acao', 'nada');
  end if;
  select * into v_av
    from public.foley_atraso_avisos
   where chave = v_chave and status = 'enviado' and criado_em >= now() - interval '10 days'
   order by criado_em desc
   limit 1;
  if not found then
    return jsonb_build_object('acao', 'nada');
  end if;
  v_prod := case v_av.grupo when 'gigantes' then 'Gigantes da Temporada' else 'Anfitrião 5 Estrelas' end;

  if v_t ~ 'nao quero renovar' then
    insert into public.foley_marcacoes (chave, grupo, telefone, contact_id)
    values (v_chave, v_av.grupo, v_av.telefone, p_contact_id)
    on conflict (chave, grupo) do update set criado_em = now(), contact_id = excluded.contact_id;
    if p_contact_id is not null then
      perform public.teo_unnichat('POST', '/contact/' || p_contact_id || '/notes', jsonb_build_object('message',
        '🤖 Painel: tocou em "Não quero renovar" no aviso de atraso do ' || v_prod ||
        '. Os avisos pararam; o Foley tira do grupo na próxima consulta (8h30 ou 20h30) e o Téo manda o aviso de saída.'));
    end if;
    insert into public.webhook_log (source, note, body)
    values ('foley', 'botão: não quero renovar', jsonb_build_object('contact_id', p_contact_id, 'grupo', v_av.grupo, 'nome', v_av.nome));
    return jsonb_build_object('acao', 'nao_renovar', 'grupo', v_av.grupo);
  end if;

  if v_t ~ 'regulariz|2a via|2 via|2ª via|segunda via'
     or (v_t ~ '^(sim|quero|pode|manda)' and v_av.criado_em >= now() - interval '3 days') then
    select s.data->'payment'->>'link' into v_link
      from public.eduzz_sales_raw s
     where s.status in ('open', 'waitingPayment', 'recovering')
       and s.data->'payment'->>'link' is not null
       and s.data->'product'->>'id' in (select produto_eduzz_id from public.produtos_grupos
                                         where (case when nome_grupo ilike '%gigantes%' then 'gigantes' else 'a5e' end) = v_av.grupo)
       and (public.assin_chave_tel(s.data->'buyer'->>'phone') = v_chave
            or s.data->>'contractId' in (select a.id_assinatura_eduzz::text from public.assinaturas_eduzz a
                                          where public.assin_chave_tel(a.dados->'client'->>'phone') = v_chave))
     order by (s.data->>'dueDate') desc nulls last
     limit 1;
    if v_link is not null then
      j := public.teo_unnichat('POST', '/meta/messages', jsonb_build_object('phone', coalesce(v_tel, v_av.telefone), 'messageText',
        'Aqui está a 2ª via' || coalesce(', ' || nullif(v_av.nome, 'tudo bem'), '') || ': ' || v_link || E'\n\n' ||
        'Assim que o pagamento cair, seu acesso ao ' || v_prod || ' segue normal e os avisos param. Qualquer dúvida, responde aqui 💛'));
    else
      j := public.teo_unnichat('POST', '/meta/messages', jsonb_build_object('phone', coalesce(v_tel, v_av.telefone), 'messageText',
        'Já pedi pro time te mandar a 2ª via' || coalesce(', ' || nullif(v_av.nome, 'tudo bem'), '') || '. Te respondem por aqui 💛'));
      if p_contact_id is not null then
        perform public.teo_unnichat('POST', '/contact/' || p_contact_id || '/notes', jsonb_build_object('message',
          '⚠️ Painel: pediu a 2ª via do ' || v_prod || ' pelo aviso de atraso e não achei fatura em aberto na Eduzz. Alguém do time precisa mandar o link de pagamento.'));
      end if;
    end if;
    insert into public.webhook_log (source, note, body)
    values ('foley', case when v_link is not null then 'botão: 2ª via enviada' else 'botão: 2ª via sem fatura' end,
            jsonb_build_object('contact_id', p_contact_id, 'grupo', v_av.grupo, 'nome', v_av.nome, 'envio', j->'status'));
    return jsonb_build_object('acao', 'regularizar', 'link', v_link is not null, 'envio', j->'status');
  end if;

  return jsonb_build_object('acao', 'nada');
end;
$function$;
revoke all on function public.foley_botao(text, text, text) from public, anon, authenticated;

select cron.schedule('foley-avisos-atraso', '7 13 * * *', $$select public.foley_enviar_atrasos()$$);
