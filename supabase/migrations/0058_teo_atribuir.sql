-- Téo: as conversas que o Téo assume saem do vendedor e vão pro atendente do
-- Téo no Unnichat. A ponte passa a aceitar a lista de atendentes e a troca de
-- atendente do contato.

alter table public.teo_config add column if not exists atendente_id text;

create or replace function public.teo_unnichat(p_method text, p_path text, p_body jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_tok text;
  v_status int;
  v_content text;
  v_ok boolean;
begin
  v_ok := (p_method = 'GET' and (p_path ~ '^/contact/[A-Za-z0-9-]+(/messages|/assign)?$' or p_path ~ '^/attendants(\?[A-Za-z0-9=&]*)?$'))
       or (p_method = 'POST' and (p_path ~ '^/contact/[A-Za-z0-9-]+/(notes|assign)$' or p_path in ('/meta/messages', '/meta/templates')));
  if not v_ok then
    return jsonb_build_object('status', 400, 'erro', 'caminho não permitido');
  end if;
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'unnichat_api_token';
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
$$;

revoke all on function public.teo_unnichat(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.teo_unnichat(text, text, jsonb) to service_role;
