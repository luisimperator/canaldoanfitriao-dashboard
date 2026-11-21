-- Vaga transferida (Fernando, 21/11 12h56–13h17, pelo Foley): o membro que larga
-- o Airbnb pode passar a vaga pra outra pessoa. Quem entra não tem compra no
-- nome dela; vale enquanto a compra de quem passou a vaga valer (renovou =
-- continua; venceu/cancelou/reembolso = sai como qualquer um). O dono pode sair
-- do grupo sem a vaga cair. Se a pessoa nova tiver compra própria valendo,
-- vale a própria.
--
-- foley_vagas: cadastro (POST/GET /api/foley/vagas).
-- foley_situacao_base: regra + WhatsApp estrangeiro (era o começo da _calc).
-- foley_situacao_calc: base + vaga transferida + botão "Não quero renovar".

create table if not exists public.foley_vagas (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  telefone_novo text not null,
  chave_novo text not null,
  nome_novo text,
  grupo text not null check (grupo in ('a5e', 'gigantes')),
  dono_telefone text,
  dono_chave text,
  dono_email text,
  dono_nome text,
  autorizado_por text,
  ativo boolean not null default true,
  unique (chave_novo, grupo)
);
alter table public.foley_vagas enable row level security;

create or replace function public.foley_situacao_base(p_itens jsonb)
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
  return v;
end;
$function$;
revoke all on function public.foley_situacao_base(jsonb) from public, anon, authenticated;

create or replace function public.foley_situacao_calc(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '60000'
as $function$
declare
  v jsonb;
  v_vg jsonb;
  v_vg_res jsonb;
begin
  v := public.foley_situacao_base(p_itens);

  -- Vaga transferida: quem não fica pela própria compra herda a decisão da
  -- compra do dono da vaga.
  select jsonb_agg(jsonb_build_object(
           'o', b.o,
           'vaga', g.id,
           'item', jsonb_build_object('telefone', g.dono_telefone, 'email', g.dono_email, 'grupo', g.grupo))
         order by b.o)
    into v_vg
    from jsonb_array_elements(v) with ordinality b(x, o)
    join public.foley_vagas g
      on g.ativo and g.chave_novo = public.assin_chave_tel(b.x->>'telefone') and g.grupo = b.x->>'grupo'
   where coalesce(b.x->>'decisao', '') not in ('fica', 'protegido')
     and (g.dono_telefone is not null or g.dono_email is not null);

  if v_vg is not null then
    v_vg_res := public.foley_situacao_base(
      (select jsonb_agg(e->'item' order by n) from jsonb_array_elements(v_vg) with ordinality t(e, n)));
    select coalesce(jsonb_agg(coalesce(m.y, b.x) order by b.o), '[]'::jsonb)
      into v
      from jsonb_array_elements(v) with ordinality b(x, o)
      left join lateral (
        select b.x || jsonb_build_object(
                 'decisao', r.y->>'decisao',
                 'decisao_propria', b.x->>'decisao',
                 'motivo', 'vaga_transferida',
                 'motivo_dono', r.y->>'motivo',
                 'dono', coalesce(g.dono_nome, 'outro membro'),
                 'fonte', 'vaga de ' || coalesce(g.dono_nome, 'outro membro') || coalesce(' (' || nullif(r.y->>'fonte', '') || ')', ''),
                 'valido_ate', r.y->'valido_ate',
                 'ultimo_pagamento', r.y->'ultimo_pagamento',
                 'dias_atraso', r.y->'dias_atraso')
          from jsonb_array_elements(v_vg) with ordinality t(e, n)
          join jsonb_array_elements(v_vg_res) with ordinality r(y, n2) on r.n2 = t.n
          join public.foley_vagas g on g.id = (t.e->>'vaga')::bigint
         where (t.e->>'o')::bigint = b.o
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

-- Cadastro/atualização de uma vaga (POST /api/foley/vagas). Devolve a vaga e a
-- situação atual da pessoa nova.
create or replace function public.foley_vaga_registrar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tel text := public.foley_tel_whatsapp(p->>'telefone_novo');
  v_grupo text := case when lower(coalesce(p->>'grupo', '')) like 'gig%' then 'gigantes'
                       when lower(coalesce(p->>'grupo', '')) = 'a5e' then 'a5e' end;
  v_dono_tel text := public.foley_tel_whatsapp(p->>'dono_telefone');
  v_email text := nullif(lower(trim(coalesce(p->>'dono_email', ''))), '');
  v_nome_dono text;
  g public.foley_vagas;
begin
  if v_tel is null then return jsonb_build_object('ok', false, 'erro', 'telefone_novo inválido'); end if;
  if v_grupo is null then return jsonb_build_object('ok', false, 'erro', 'grupo tem que ser a5e ou gigantes'); end if;
  if v_dono_tel is null and v_email is null then
    return jsonb_build_object('ok', false, 'erro', 'mande dono_telefone ou dono_email');
  end if;
  v_nome_dono := coalesce(
    nullif(trim(p->>'dono_nome'), ''),
    (select initcap(split_part(trim(a.dados->'client'->>'name'), ' ', 1)) from public.assinaturas_eduzz a
      where v_email is not null and lower(coalesce(a.email_comprador, a.dados->'client'->>'email')) = v_email limit 1),
    (select initcap(split_part(trim(s.data->'buyer'->>'name'), ' ', 1)) from public.eduzz_sales_raw s
      where v_email is not null and lower(s.data->'buyer'->>'email') = v_email limit 1));

  insert into public.foley_vagas (telefone_novo, chave_novo, nome_novo, grupo, dono_telefone, dono_chave, dono_email, dono_nome, autorizado_por, ativo)
  values (v_tel, public.assin_chave_tel(v_tel), nullif(trim(p->>'nome_novo'), ''), v_grupo, v_dono_tel,
          public.assin_chave_tel(v_dono_tel), v_email, v_nome_dono, nullif(trim(p->>'autorizado_por'), ''),
          coalesce((p->>'ativo')::boolean, true))
  on conflict (chave_novo, grupo) do update
    set telefone_novo = excluded.telefone_novo,
        nome_novo = coalesce(excluded.nome_novo, public.foley_vagas.nome_novo),
        dono_telefone = excluded.dono_telefone,
        dono_chave = excluded.dono_chave,
        dono_email = excluded.dono_email,
        dono_nome = coalesce(excluded.dono_nome, public.foley_vagas.dono_nome),
        autorizado_por = coalesce(excluded.autorizado_por, public.foley_vagas.autorizado_por),
        ativo = excluded.ativo,
        atualizado_em = now()
  returning * into g;

  return jsonb_build_object(
    'ok', true,
    'vaga', to_jsonb(g) - 'chave_novo' - 'dono_chave',
    'situacao_agora', public.foley_situacao_calc(jsonb_build_array(jsonb_build_object('telefone', g.telefone_novo, 'grupo', g.grupo)))->0);
end;
$function$;
revoke all on function public.foley_vaga_registrar(jsonb) from public, anon, authenticated;
