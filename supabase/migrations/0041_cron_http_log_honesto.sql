-- Cron que chama HTTP: parar de mentir no log.
--
-- Dois jobs falam com o app por HTTP (sync-asaas e raspagem-asaas-noite) e os
-- dois registravam status errado no cron.job_run_details, de duas formas:
--
-- 1) TIMEOUT. O default do curl aqui é 5s. A rota de sync demora mais que isso,
--    então o pg_cron desistia e gravava "failed" — mas o app já tinha recebido
--    a chamada e terminava o trabalho normalmente (dava pra ver o synced_at
--    chegando 4s depois do "erro"). Log dizia falha, dados diziam sucesso.
--
-- 2) ERRO HTTP VIRANDO SUCESSO. http_get() devolvendo 500 é uma linha como
--    outra qualquer: o SQL rodou bem, então o pg_cron gravava "succeeded".
--    Ou seja, o log também escondia falha de verdade.
--
-- O primeiro problema fazia a gente ignorar o alarme; o segundo fazia o alarme
-- nunca tocar. Juntos, o log não servia pra nada — e ia atrapalhar no dia em
-- que o sync quebrasse de verdade.
--
-- Agora: timeout de 120s (a rota tem maxDuration 300, mas se passar de 2 min é
-- porque travou) e status fora da faixa 2xx levanta exceção, que é o que o
-- pg_cron entende como falha.

select cron.schedule('sync-asaas', '40 * * * *', $cron$
  do $job$
  declare
    resp extensions.http_response;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '120');
    resp := extensions.http_get(
      'https://painel.canaldoanfitriao.com.br/api/import/asaas?dias=120&key='
      || public.asaas_sync_key()
    );
    if resp.status < 200 or resp.status >= 300 then
      raise exception 'sync-asaas: HTTP % — %', resp.status, left(resp.content, 300);
    end if;
  end
  $job$;
$cron$);

select cron.schedule('raspagem-asaas-noite', '40 22 * * *', $cron$
  do $job$
  declare
    resp extensions.http_response;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '120');
    resp := extensions.http_get(
      'https://painel.canaldoanfitriao.com.br/api/import/asaas-raspagem?key='
      || public.asaas_raspagem_key()
    );
    if resp.status < 200 or resp.status >= 300 then
      raise exception 'raspagem-asaas: HTTP % — %', resp.status, left(resp.content, 300);
    end if;
  end
  $job$;
$cron$);
