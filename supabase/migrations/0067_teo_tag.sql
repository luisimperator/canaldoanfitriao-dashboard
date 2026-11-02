-- Téo: marca com a tag "teo" do Unnichat todo lead que ele assume. A
-- automação "Lista de Espera 2.0" usa essa tag pra parar as tentativas de
-- contato e não tirar o lead do Téo.
alter table public.teo_config add column if not exists tag_teo_id text;
update public.teo_config set tag_teo_id = '01a19e9f-a74d-75dc-aa9e-6d21cebbd904' where id = 1 and tag_teo_id is null;
alter table public.teo_conversas add column if not exists tag_em timestamptz;

-- Ponte do Unnichat: libera POST /contact/{id}/tags.
create or replace function public.teo_unnichat(p_method text, p_path text, p_body jsonb default null)
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
       or (p_method = 'POST' and (p_path ~ '^/contact/[A-Za-z0-9-]+/(notes|assign|tags)$' or p_path in ('/meta/messages', '/meta/templates')));
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

revoke all on function public.teo_unnichat(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.teo_unnichat(text, text, jsonb) to service_role;
