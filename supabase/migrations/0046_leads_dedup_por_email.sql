-- Leads duplicados: a mesma pessoa virava duas linhas.
--
-- Cada ponta de entrada fazia upsert pela PRÓPRIA chave e nunca olhava a outra:
--
--   Unnichat (webhook)  → upsert on conflict (unnichat_id)
--   Mailchimp (sync)    → upsert on conflict (mailchimp_id)
--
-- Quem chegava pelos dois canais — o caminho normal de quem entra na lista de
-- espera e depois fala no WhatsApp — não casava em lugar nenhum: a tabela só
-- tinha índice único em `unnichat_id` e em `mailchimp_id`, nenhum em e-mail.
-- Caixa diferente ("Masahirotony@" vs "masahirotony@") separava ainda mais.
--
-- Eram 873 linhas sobrando em 861 pessoas, sobre 46.065 leads — e em dias de
-- pico quase metade do volume do dia (04/08: 88 linhas para 49 pessoas). Isso
-- inflava a contagem de leads em todo lugar onde ela aparece, inclusive no CAC
-- e no leads-por-venda, que ficavam otimistas demais.
--
-- Três movimentos: funde o histórico, tranca no banco, e ensina as duas pontas
-- a reivindicar quem já existe.
--
-- Fora do alcance: 284 leads sem e-mail nenhum (não há por onde casar) e 1 par
-- que só coincide por telefone. Ficam como estão.

-- ---------------------------------------------------------------------------
-- 1. Fusão do histórico
-- ---------------------------------------------------------------------------

update leads
   set email = lower(trim(email))
 where email is not null and email <> lower(trim(email));

create or replace function public.fundir_leads_duplicados()
 returns table(email text, linhas_fundidas int, mantido uuid)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  g record;
  f record;
  v_manter uuid;
  v_perder uuid[];
  v_extra jsonb;
  v_tags jsonb;
  v_contatos jsonb;
begin
  for g in
    select lower(trim(l.email)) as chave,
           array_agg(l.id order by l.created_at, l.id) as ids
      from leads l
     where l.email is not null and trim(l.email) <> ''
     group by 1
    having count(*) > 1
  loop
    -- Sobrevive a linha mais antiga: é o primeiro registro da pessoa.
    v_manter := g.ids[1];
    v_perder := g.ids[2:];

    -- extra: mescla campo a campo, valor mais recente ganha.
    select coalesce(jsonb_object_agg(z.key, z.value), '{}'::jsonb)
      into v_extra
      from (
        select distinct on (e.key) e.key, e.value
          from leads l, jsonb_each(coalesce(l.extra, '{}'::jsonb)) e
         where l.id = any(g.ids) and e.key <> 'tags'
         order by e.key, l.updated_at desc nulls last
      ) z;

    -- tags: união, nunca substituição — cada ponta traz um pedaço.
    select coalesce(jsonb_agg(distinct t), '[]'::jsonb)
      into v_tags
      from leads l, jsonb_array_elements_text(coalesce(l.extra->'tags', '[]'::jsonb)) t
     where l.id = any(g.ids);

    if jsonb_array_length(v_tags) > 0 then
      v_extra := v_extra || jsonb_build_object('tags', v_tags);
    end if;

    -- 73 pessoas têm mais de um contato no Unnichat (duas conversas). A coluna
    -- só guarda um, então o extra fica com a lista inteira pra não perder o
    -- rastro — lead_events é indexado por unnichat_id e continua alcançável.
    select coalesce(jsonb_agg(distinct l.unnichat_id), '[]'::jsonb)
      into v_contatos
      from leads l
     where l.id = any(g.ids) and l.unnichat_id is not null;

    if jsonb_array_length(v_contatos) > 1 then
      v_extra := v_extra || jsonb_build_object('unnichat_ids', v_contatos);
    end if;

    select
      min(l.created_at) as created_at,
      -- nome mais completo vence: o Mailchimp manda "ana", o Unnichat manda
      -- "Ana Paula Fernandes"
      (array_agg(l.name order by length(coalesce(l.name,'')) desc))[1] as name,
      (array_agg(l.phone order by (l.phone is null), l.updated_at desc nulls last))[1] as phone,
      (array_agg(l.source order by (l.source is null or l.source = 'outro'),
                                   l.updated_at desc nulls last))[1] as source,
      -- status mais avançado vence, pra fusão nunca rebaixar quem já andou no funil
      (array_agg(l.status order by case l.status
           when 'convertido'   then 5
           when 'quente'       then 4
           when 'perdido'      then 3
           when 'lista_espera' then 2
           else 1 end desc, l.updated_at desc nulls last))[1] as status,
      (array_agg(l.seller_id order by (l.seller_id is null), l.updated_at desc nulls last))[1] as seller_id,
      min(l.mql_at) as mql_at,
      (array_agg(l.pipeline_stage order by (l.pipeline_stage is null),
                                           l.updated_at desc nulls last))[1] as pipeline_stage,
      (array_agg(l.mailchimp_id order by (l.mailchimp_id is null),
                                         l.updated_at desc nulls last))[1] as mailchimp_id,
      (array_agg(l.unnichat_id order by (l.unnichat_id is null),
                                        l.updated_at desc nulls last))[1] as unnichat_id,
      max(l.updated_at) as updated_at
      into f
      from leads l
     where l.id = any(g.ids);

    -- As vendas seguem a pessoa, não a linha.
    update sales set lead_id = v_manter where lead_id = any(v_perder);

    -- Apaga ANTES de gravar: unnichat_id e mailchimp_id são únicos, e a linha
    -- perdedora ainda segura o valor que vai para a sobrevivente.
    delete from leads where id = any(v_perder);

    update leads m set
      created_at     = f.created_at,
      name           = coalesce(f.name, m.name),
      phone          = coalesce(f.phone, m.phone),
      source         = coalesce(f.source, m.source),
      status         = coalesce(f.status, m.status),
      seller_id      = coalesce(f.seller_id, m.seller_id),
      mql_at         = coalesce(f.mql_at, m.mql_at),
      pipeline_stage = coalesce(f.pipeline_stage, m.pipeline_stage),
      mailchimp_id   = coalesce(f.mailchimp_id, m.mailchimp_id),
      unnichat_id    = coalesce(f.unnichat_id, m.unnichat_id),
      extra          = v_extra,
      updated_at     = f.updated_at
    where m.id = v_manter;

    email := g.chave;
    linhas_fundidas := array_length(v_perder, 1);
    mantido := v_manter;
    return next;
  end loop;
end;
$function$;

select count(*) as grupos_fundidos, sum(linhas_fundidas) as linhas_removidas
  from fundir_leads_duplicados();

-- ---------------------------------------------------------------------------
-- 2. Trava: duplicata vira impossível, não só improvável
-- ---------------------------------------------------------------------------

create or replace function public.normalizar_email_lead()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.email := nullif(lower(trim(new.email)), '');
  return new;
end;
$function$;

drop trigger if exists leads_normaliza_email on leads;
create trigger leads_normaliza_email
  before insert or update of email on leads
  for each row execute function public.normalizar_email_lead();

create unique index if not exists leads_email_unico
  on leads (lower(trim(email)))
  where email is not null and trim(email) <> '';

-- ---------------------------------------------------------------------------
-- 3. As duas pontas passam a reivindicar quem já existe
-- ---------------------------------------------------------------------------

-- Chamada pelo webhook do Unnichat antes do upsert: se a pessoa já está na base
-- pelo e-mail (veio do Mailchimp) e ainda não tem contato do Unnichat, cola o
-- contato nela. O upsert seguinte cai no update em vez de criar linha nova.
create or replace function public.claim_lead_for_unnichat(p_email text, p_unnichat_id text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if p_email is null or trim(p_email) = ''
     or p_unnichat_id is null or trim(p_unnichat_id) = '' then
    return null;
  end if;

  -- esse contato já tem dono: o upsert normal resolve
  if exists (select 1 from leads where unnichat_id = p_unnichat_id) then
    return null;
  end if;

  select id into v_id
    from leads
   where unnichat_id is null
     and lower(trim(email)) = lower(trim(p_email))
   order by created_at, id
   limit 1;

  if v_id is null then
    return null;
  end if;

  update leads set unnichat_id = p_unnichat_id, updated_at = now() where id = v_id;
  return v_id;
end;
$function$;

-- Mesma ideia do outro lado: o sync do Mailchimp cola o mailchimp_id em quem já
-- existe pelo e-mail antes de tentar inserir.
create or replace function public.upsert_mailchimp_leads(p_rows jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update leads l
     set mailchimp_id = r.mc, updated_at = now()
    from (
      select r->>'mailchimp_id' as mc, lower(trim(r->>'email')) as em
        from jsonb_array_elements(p_rows) r
       where coalesce(r->>'mailchimp_id','') <> ''
         and coalesce(r->>'email','') <> ''
    ) r
   where l.mailchimp_id is null
     and lower(trim(l.email)) = r.em
     and not exists (select 1 from leads l2 where l2.mailchimp_id = r.mc);

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
    -- Se o e-mail já pertence a outro contato do Mailchimp, pula a linha em vez
    -- de estourar o índice único e derrubar o sync inteiro.
    and not exists (
      select 1 from leads l3
       where lower(trim(l3.email)) = lower(trim(r->>'email'))
         and l3.mailchimp_id is not null
         and l3.mailchimp_id <> r->>'mailchimp_id'
    )
  on conflict (mailchimp_id) do update set
    email = coalesce(excluded.email, leads.email),
    -- Nome mais completo vence. O Mailchimp costuma ter só o primeiro nome
    -- ("ana"); o Unnichat traz o nome cheio. Agora que as duas pontas dividem a
    -- MESMA linha, o coalesce simples deixava o sync rebaixar o nome bom a cada
    -- passada — regressão que a própria unificação criaria.
    name = case
      when length(coalesce(excluded.name, '')) > length(coalesce(leads.name, ''))
        then excluded.name
      else leads.name
    end,
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
end;
$function$;
