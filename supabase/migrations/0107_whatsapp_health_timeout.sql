-- Alarme falso do WhatsApp do suporte (pergunta 17, Fernando 16/11: "sim").
-- A checagem de hora em hora desistia depois de 1 s tentando conectar na Meta
-- ("Failed to connect to graph.facebook.com port 443 after 1001 ms") e gravava
-- ERRO sem haver problema. Agora: 10 s pra conectar, 20 s no total e uma
-- segunda tentativa antes de acusar erro. O resto é igual.
create or replace function public.whatsapp_health_check()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'vault', 'extensions'
as $function$
declare
  v_tok text;
  v_pid text;
  v_res extensions.http_response;
  v_body jsonb := '{}'::jsonb;
  v_ok boolean := false;
  v_detail text;
  v_tentativa int;
begin
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'whatsapp_token';
  select decrypted_secret into v_pid from vault.decrypted_secrets where name = 'whatsapp_phone_number_id';

  if v_tok is null or v_pid is null then
    v_detail := 'credencial ausente no Vault (whatsapp_token / whatsapp_phone_number_id)';
  else
    perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '10000');
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
    for v_tentativa in 1..2 loop
      begin
        select * into v_res from extensions.http((
          'GET',
          'https://graph.facebook.com/v21.0/' || v_pid || '?fields=display_phone_number,verified_name,quality_rating',
          array[extensions.http_header('Authorization', 'Bearer ' || v_tok)],
          null, null
        )::extensions.http_request);
        begin
          v_body := v_res.content::jsonb;
        exception when others then
          v_body := jsonb_build_object('raw', left(v_res.content, 500));
        end;
        v_ok := v_res.status = 200;
        if v_ok then
          v_detail := format('token ok · %s · qualidade %s',
            coalesce(v_body->>'display_phone_number', v_pid),
            coalesce(v_body->>'quality_rating', '?'));
        else
          v_detail := format('Meta recusou o token (HTTP %s, code %s: %s)',
            v_res.status,
            coalesce(v_body->'error'->>'code', '?'),
            coalesce(v_body->'error'->>'message', '?'));
        end if;
        -- Resposta da Meta (ok ou recusa do token): não adianta tentar de novo.
        exit;
      exception when others then
        v_detail := 'não consegui falar com a Meta: ' || sqlerrm;
        if v_tentativa = 1 then
          perform pg_sleep(5);
        end if;
      end;
    end loop;
  end if;

  insert into public.whatsapp_flags (chave, valor) values
    ('health_ok', v_ok::text),
    ('health_detail', v_detail),
    ('health_checked_at', now()::text)
  on conflict (chave) do update
    set valor = excluded.valor, updated_at = now();

  if not v_ok then
    insert into public.webhook_log (source, note, body)
    values ('whatsapp', 'ERRO: ' || v_detail, v_body);
  end if;

  return jsonb_build_object('ok', v_ok, 'detail', v_detail, 'checked_at', now());
end;
$function$;
