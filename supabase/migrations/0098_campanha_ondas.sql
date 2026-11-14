-- Disparo pros alunos do Anfitrião 5 Estrelas, em ondas de 100 sorteadas ao
-- acaso (Fernando, 14/11: "pode mandar todos os disparos"). Os passos das
-- ondas 1 e 2 viram funções, pra cada onda nova rodar igual:
--
--   1. select campanha_sortear_onda(3);          -- sorteia 100, metade D e metade E por perfil
--   2. select campanha_preparar_onda(3);         -- acha o contato no Unnichat, tira Diego e
--                                                --   quem o vendedor atendeu nos últimos 15 dias;
--                                                --   sem contato: excluido = 'criar contato'
--   3. criar no Unnichat os 'criar contato' (MCP create-contact), gravar contact_id e
--      excluido = null
--   4. select campanha_enviar_onda(3, 25);       -- manda 25 por chamada (cabe no tempo da consulta)
--
-- Elegível: comprou o Anfitrião 5 Estrelas (sem Encontro/ingresso), celular
-- brasileiro, não comprou a Black, não está em conversa (sem interesse, com
-- vendedor nos últimos 15 dias, Téo respondeu nos últimos 3 dias, call
-- marcada) e não recebeu onda nenhuma. Perfil pela data real do pagamento
-- (paidAt da Eduzz): ativo = comprou no último ano.

create or replace function public.campanha_sortear_onda(p_onda integer, p_qtd integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elegiveis integer;
  v_res jsonb;
begin
  if exists (select 1 from campanha_alunos where onda = p_onda) then
    raise exception 'a onda % já existe', p_onda;
  end if;
  create temporary table _eleg on commit drop as
  with compras as (
    select lower(trim(s.buyer_email)) em, s.buyer_name nome, s.product,
           coalesce((r.data->>'paidAt')::timestamptz, s.sale_date::timestamptz, s.created_at) pago,
           regexp_replace(coalesce(r.data->'buyer'->>'phone', r.data->'buyer'->>'cellphone', ''), '\D', '', 'g') tel
      from sales s left join eduzz_sales_raw r on r.id = s.eduzz_invoice_id
     where s.status = 'paga'
  ),
  a5e as (
    select *, case when length(tel) in (10, 11) then '55' || tel else tel end tel_n
      from compras where product ~* 'anfitri[aã]o 5 estrelas' and product !~* '(encontro|ingresso)'
  ),
  black as (
    select em, right(tel, 8) t8 from compras where product ~* 'black friday hist'
    union select lower(email), right(regexp_replace(coalesce(data->>'telefone', ''), '\D', '', 'g'), 8)
            from tmb_pedidos_raw where lancamento ilike 'black friday%' and status_pedido = 'Efetivado'
    union select lower(email), right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8)
            from tmb_eventos where evento = 'vendas' and status = 'Efetivado' and produto ilike 'black friday%'
  ),
  ocupado as (
    select right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) t8 from teo_conversas
     where motivo_humano = 'sem_interesse'
        or (estado = 'humano' and atualizado_em > now() - interval '15 days')
        or ultima_resposta_em > now() - interval '3 days'
    union select right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 8)
            from teo_calls k join teo_conversas c on c.contact_id = k.contact_id
           where k.inicio > now() and k.status <> 'cancelada'
    union select right(telefone, 8) from campanha_alunos
    union select '61859863'
  ),
  pessoas as (
    select right(tel_n, 8) t8, max(tel_n) tel, max(em) em, max(nome) nome, max(product) produto, max(pago) ultima
      from a5e
     where (tel_n ~ '^55\d{11}$' and substr(tel_n, 5, 1) = '9')
        or (tel_n ~ '^55\d{10}$' and substr(tel_n, 5, 1) ~ '[6-9]')
     group by right(tel_n, 8)
  )
  select p.* from pessoas p
   where p.t8 not in (select t8 from black where t8 is not null)
     and coalesce(p.em, '') not in (select em from black where em is not null)
     and p.t8 not in (select t8 from ocupado where t8 is not null);

  select count(*) into v_elegiveis from _eleg;

  with sorteio as (
    select *, case when ultima >= now() - interval '1 year' then 'a5e_ativo' else 'a5e_ex' end perfil
      from _eleg order by random() limit p_qtd
  ),
  dividido as (
    select *, case when row_number() over (partition by perfil order by random()) % 2 = 0 then 'D' else 'E' end template
      from sorteio
  ),
  ins as (
    insert into campanha_alunos (onda, telefone, email, nome, perfil, produto, template)
    select p_onda, tel, em, nome, perfil, produto, template from dividido
    returning perfil, template
  )
  select jsonb_build_object(
           'elegiveis', v_elegiveis,
           'sorteados', count(*),
           'D', count(*) filter (where template = 'D'),
           'E', count(*) filter (where template = 'E'),
           'ativos', count(*) filter (where perfil = 'a5e_ativo'))
    into v_res from ins;
  return v_res;
end;
$$;

-- Acha o contato de cada sorteado no Unnichat e confere o dono da conversa.
create or replace function public.campanha_preparar_onda(p_onda integer)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_tok text;
  v_res extensions.http_response;
  v_cid text;
  v_dono text;
  v_ult timestamptz;
  j jsonb;
  n_ok integer := 0;
  n_criar integer := 0;
  n_diego integer := 0;
  n_vend integer := 0;
begin
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'unnichat_api_token';
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
  for r in
    select id, telefone from campanha_alunos
     where onda = p_onda and contact_id is null and excluido is null and enviado_em is null
     order by id
  loop
    select * into v_res from extensions.http((
      'POST', 'https://unnichat.com.br/api/contact/search',
      array[extensions.http_header('Authorization', 'Bearer ' || v_tok), extensions.http_header('Accept', 'application/json')],
      'application/json', jsonb_build_object('phone', r.telefone)::text)::extensions.http_request);
    v_cid := null;
    begin
      v_cid := (v_res.content::jsonb)->'data'->0->>'id';
    exception when others then v_cid := null;
    end;
    if v_cid is null then
      update campanha_alunos set excluido = 'criar contato' where id = r.id;
      n_criar := n_criar + 1;
      continue;
    end if;
    j := public.teo_unnichat('GET', '/contact/' || v_cid || '/assign', null);
    v_dono := coalesce(j->'body'->'data'->>'name', '');
    if v_dono ~* 'diego' then
      update campanha_alunos set contact_id = v_cid, excluido = 'contato do Diego' where id = r.id;
      n_diego := n_diego + 1;
      continue;
    end if;
    if v_dono <> '' then
      j := public.teo_unnichat('GET', '/contact/' || v_cid || '/messages', null);
      select max((m->>'date')::timestamptz) into v_ult
        from jsonb_array_elements(case when jsonb_typeof(j->'body'->'data') = 'array' then j->'body'->'data' else '[]'::jsonb end) m
       where m->>'senderBy' = 'user' and coalesce(m->>'origin', '') = ''
         and m->>'type' in ('message', 'audio', 'image', 'document', 'video');
      if v_ult is not null and v_ult > now() - interval '15 days' then
        update campanha_alunos
           set contact_id = v_cid,
               excluido = 'em conversa com vendedor (' || split_part(v_dono, ' ', 1) || ', ' || to_char(v_ult at time zone 'America/Sao_Paulo', 'DD/MM') || ')'
         where id = r.id;
        n_vend := n_vend + 1;
        continue;
      end if;
    end if;
    update campanha_alunos set contact_id = v_cid where id = r.id;
    n_ok := n_ok + 1;
  end loop;
  return jsonb_build_object('prontos', n_ok, 'criar_contato', n_criar, 'diego', n_diego, 'com_vendedor', n_vend);
end;
$$;

-- Manda o template da variante pra até p_lote sorteados prontos da onda.
create or replace function public.campanha_enviar_onda(p_onda integer, p_lote integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  j jsonb;
  pn text;
  ok boolean;
  n_ok integer := 0;
  n_falha integer := 0;
begin
  if extract(hour from now() at time zone 'America/Sao_Paulo') < 8
     or extract(hour from now() at time zone 'America/Sao_Paulo') >= 21 then
    raise exception 'fora do horário de iniciativa (8h às 21h)';
  end if;
  for r in
    select id, telefone, template, contact_id, nome from campanha_alunos
     where onda = p_onda and enviado_em is null and excluido is null and contact_id is not null
     order by id limit p_lote
  loop
    pn := case when r.nome ~* '(ltda|leil|associad|administra|residencial|eireli|imob)' then 'tudo bem'
               else initcap(split_part(regexp_replace(trim(coalesce(r.nome, '')), '\s+', ' ', 'g'), ' ', 1)) end;
    if coalesce(pn, '') = '' then pn := 'tudo bem'; end if;
    j := public.teo_unnichat('POST', '/meta/templates', jsonb_build_object(
      'phone', r.telefone,
      'templateId', case r.template when 'D' then '1193181226981059' else '1696092268823081' end,
      'bodyParameters', jsonb_build_array(jsonb_build_object('type', 'text', 'text', pn))));
    ok := coalesce((j->>'status')::int, 0) between 200 and 299;
    update campanha_alunos set
      enviado_em = case when ok then now() else null end,
      mensagem = case when not ok then null
                      when r.template = 'D' then 'Oi, ' || pn || '! O Rômulo liberou uma condição só pra quem já é ou foi aluno dele. Posso te mandar?'
                      else 'Oi, ' || pn || '! Pergunta rápida: quantos imóveis você tem hoje? Tenho uma coisa pra te mostrar que depende da sua resposta.' end,
      excluido = case when ok then null else 'envio falhou: ' || coalesce(j->>'status', '?') || ' ' || left((j->'body')::text, 200) end
     where id = r.id;
    insert into webhook_log (source, note, body)
    values ('teo', 'disparo onda ' || p_onda || ' (' || r.template || ')' || case when ok then '' else ' FALHOU' end,
            jsonb_build_object('campanha_id', r.id, 'contact_id', r.contact_id, 'nome', r.nome, 'telefone', r.telefone,
                               'status', j->>'status', 'resposta', j->'body'));
    if ok then n_ok := n_ok + 1; else n_falha := n_falha + 1; end if;
  end loop;
  return jsonb_build_object('enviados', n_ok, 'falhas', n_falha,
    'faltam', (select count(*) from campanha_alunos where onda = p_onda and enviado_em is null and excluido is null and contact_id is not null));
end;
$$;

revoke all on function public.campanha_sortear_onda(integer, integer) from public, anon, authenticated;
revoke all on function public.campanha_preparar_onda(integer) from public, anon, authenticated;
revoke all on function public.campanha_enviar_onda(integer, integer) from public, anon, authenticated;
grant execute on function public.campanha_sortear_onda(integer, integer) to service_role;
grant execute on function public.campanha_preparar_onda(integer) to service_role;
grant execute on function public.campanha_enviar_onda(integer, integer) to service_role;

-- A varredura do botão (0094) passa a olhar as ondas novas também: ela já pega
-- toda linha com template D enviada nos últimos 3 dias.
