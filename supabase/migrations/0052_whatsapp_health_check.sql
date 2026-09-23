-- Saúde do WhatsApp: o token morre em silêncio, o cliente descobre primeiro.
--
-- Em 21/09/2026 o token da Cloud API deixou de valer (Meta devolve 190,
-- OAuthException). O webhook continuou RECEBENDO — a assinatura confere,
-- o app secret está certo — e a Lia continuou gerando resposta. Só o envio
-- falhava. Ninguém viu: o erro ficou no webhook_log, e o painel não olha lá.
-- Dois dias de suporte mudo, descoberto porque um cliente reclamou.
--
-- Este check pinga a Meta de hora em hora com o token do Vault (o mesmo que
-- o app usa) e guarda o resultado em whatsapp_flags. Quando falha, registra
-- no webhook_log com "ERRO:" na nota — o mesmo padrão do sync_meta_ads — e
-- a página Integrações mostra o selo vermelho. Nunca expõe o token.

create or replace function public.whatsapp_health_check()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'vault', 'extensions'
as $$
declare
  v_tok text;
  v_pid text;
  v_res extensions.http_response;
  v_body jsonb := '{}'::jsonb;
  v_ok boolean := false;
  v_detail text;
begin
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'whatsapp_token';
  select decrypted_secret into v_pid from vault.decrypted_secrets where name = 'whatsapp_phone_number_id';

  if v_tok is null or v_pid is null then
    v_detail := 'credencial ausente no Vault (whatsapp_token / whatsapp_phone_number_id)';
  else
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
    exception when others then
      v_detail := 'não consegui falar com a Meta: ' || sqlerrm;
    end;
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
$$;

revoke all on function public.whatsapp_health_check() from public, anon, authenticated;
grant execute on function public.whatsapp_health_check() to service_role;

select cron.unschedule('whatsapp-health') where exists (select 1 from cron.job where jobname = 'whatsapp-health');
select cron.schedule('whatsapp-health', '5 * * * *', $$select public.whatsapp_health_check()$$);
