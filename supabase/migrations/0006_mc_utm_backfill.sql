-- Origem dos leads via Mailchimp: extrai as UTMs (utm_source/medium/campaign/
-- content/term + vidorigem) para extra.utm, que é o que a página /origem lê.
--
-- Contexto: o sync de produção é a função sync_mc_full() chamada por cron (não
-- a rota Next /api/sync/mailchimp, que dá 504 ao varrer 44k em uma requisição).
-- A versão antiga guardava o objeto INTEIRO do contato em extra.mc (payload
-- enorme) e travava na ~3a página, cobrindo só ~1.150 leads e sem extrair UTM.
-- Esta versão busca só os campos necessários, extrai um extra.utm compacto e
-- não guarda mais o blob mc.

-- Limpa valor de merge field: vazio, "0" ou placeholder de template ({{...}}).
create or replace function public.mc_clean(p text)
returns text language sql immutable as $$
  select case
    when p is null then null
    when position('{{' in p) > 0 then null
    else nullif(nullif(btrim(p), ''), '0')
  end;
$$;

create or replace function public.sync_mc_full(p_start integer, p_end integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'vault'
 set statement_timeout to '600000'
as $function$
declare
  v_key text; v_auth text; v_off int; v_members jsonb; v_cnt int; v_upd int;
  v_page int := 1000;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name='mailchimp_api_key';
  v_auth := 'Basic '||replace(encode(convert_to('anystring:'||v_key,'UTF8'),'base64'),E'\n','');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','10000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','45000');
  create temp table _m(mid text, obj jsonb) on commit drop;
  v_off := p_start;
  loop
    exit when v_off >= p_end;
    -- só os campos necessários: payload pequeno = sem stall.
    v_members := (extensions.http(('GET',
      'https://us4.api.mailchimp.com/3.0/lists/93f3719e8c/members?count='||v_page||'&offset='||v_off||
      '&fields=members.id,members.tags,members.merge_fields,members.full_name,members.timestamp_signup,members.timestamp_opt',
      array[extensions.http_header('Authorization',v_auth)],null,null)::extensions.http_request)).content::jsonb->'members';
    v_cnt := coalesce(jsonb_array_length(v_members),0);
    exit when v_cnt = 0;
    insert into _m select m->>'id', m from jsonb_array_elements(v_members) m;
    v_off := v_off + v_page;
    exit when v_cnt < v_page;
  end loop;

  -- mapeamento estável da audiência: MMERGE12=utm_source, 13=medium,
  -- 11=campaign, 14=content, 15=term, VIDORIGEM=vidorigem.
  update public.leads l set
    extra = (coalesce(l.extra,'{}'::jsonb) - 'mc')
            || jsonb_build_object('tags',
                 coalesce((select jsonb_agg(t->>'name') from jsonb_array_elements(_m.obj->'tags') t),'[]'::jsonb))
            || case when u.utm <> '{}'::jsonb then jsonb_build_object('utm', u.utm) else '{}'::jsonb end,
    created_at = coalesce(nullif(left(_m.obj->>'timestamp_signup',10),'')::date,
                         nullif(left(_m.obj->>'timestamp_opt',10),'')::date, l.created_at),
    name  = coalesce(l.name, nullif(_m.obj->>'full_name',''),
                     nullif(trim(coalesce(_m.obj->'merge_fields'->>'FNAME','')||' '||coalesce(_m.obj->'merge_fields'->>'LNAME','')),'')),
    phone = coalesce(l.phone, nullif(_m.obj->'merge_fields'->>'PHONE','')),
    updated_at = now()
  from _m
  cross join lateral (
    select jsonb_strip_nulls(jsonb_build_object(
      'source',    public.mc_clean(_m.obj->'merge_fields'->>'MMERGE12'),
      'medium',    public.mc_clean(_m.obj->'merge_fields'->>'MMERGE13'),
      'campaign',  public.mc_clean(_m.obj->'merge_fields'->>'MMERGE11'),
      'content',   public.mc_clean(_m.obj->'merge_fields'->>'MMERGE14'),
      'term',      public.mc_clean(_m.obj->'merge_fields'->>'MMERGE15'),
      'vidorigem', public.mc_clean(_m.obj->'merge_fields'->>'VIDORIGEM')
    )) as utm
  ) u
  where l.mailchimp_id = _m.mid;
  get diagnostics v_upd = row_count;
  return v_upd;
end;$function$;

-- Cron: varre a base inteira a cada 6h (a função leve completa server-side).
-- cron.schedule faz upsert pelo nome do job, então é idempotente.
select cron.schedule('sync-mc-full', '0 */6 * * *', $$select public.sync_mc_full(0, 100000)$$);
