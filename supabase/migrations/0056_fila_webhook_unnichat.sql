-- Fila dos avisos do Unnichat.
--
-- Antes, cada aviso era processado na hora, dentro da requisição: ~8 idas ao
-- banco, uma delas chamando a API do Unnichat e segurando uma conexão por até
-- 6s. No pico do lançamento de set/26 (10 mil avisos no mês) as conexões
-- acabavam e ~1.360 avisos se perderam. Agora o webhook só grava o aviso aqui
-- (pendente = true) e responde na hora; a rota /api/sync/unnichat-fila, a cada
-- minuto, processa a fila em ritmo controlado e tenta de novo o que falhar.
--
-- Linhas antigas ficam com pendente = false (já foram processadas na época).

alter table public.webhook_log
  add column if not exists etapa text,
  add column if not exists pendente boolean not null default false,
  add column if not exists tentativas int not null default 0,
  add column if not exists processando_ate timestamptz,
  add column if not exists processado_em timestamptz,
  add column if not exists erro text;

create index if not exists webhook_log_fila_unnichat
  on public.webhook_log (created_at)
  where pendente and source = 'unnichat';

-- Pega um lote da fila e trava por 2 minutos, para duas execuções seguidas
-- (ou um cron entregue em dobro) não processarem o mesmo aviso.
create or replace function public.pegar_fila_unnichat(p_limite int default 300)
returns table (id uuid, created_at timestamptz, body jsonb, etapa text, tentativas int)
language sql
set search_path = public
as $$
  update public.webhook_log w
     set processando_ate = now() + interval '2 minutes'
   where w.id in (
     select f.id from public.webhook_log f
      where f.source = 'unnichat' and f.pendente
        and (f.processando_ate is null or f.processando_ate < now())
      order by f.created_at
      limit p_limite
      for update skip locked)
  returning w.id, w.created_at, w.body, w.etapa, w.tentativas;
$$;

revoke all on function public.pegar_fila_unnichat(int) from public, anon, authenticated;
grant execute on function public.pegar_fila_unnichat(int) to service_role;
