-- Uma resposta da IA por conversa de cada vez.
--
-- O webhook rodava o agente uma vez POR MENSAGEM recebida. Cliente que manda
-- "oi" + print + "tá dando isso" em 5 segundos disparava três agentes em
-- paralelo, cada um sem ver o que os outros estavam respondendo. Resultado
-- visto em 24/09/2026: respostas triplicadas, contradição na mesma rodada
-- ("não consigo ver imagem" + "esse aviso aparece quando…"), pedido de
-- sobrenome depois de já ter confirmado, "desculpa pela mensagem repetida".
-- Com o Opus 5.5 (sempre pensa antes) cada execução ficou mais longa e a
-- janela de sobreposição cresceu, por isso piorou de repente.
--
-- A trava é um prazo em support_conversas: quem consegue gravar ia_lock_ate
-- no futuro é o único que responde. Prazo e não booleano pra que uma função
-- que morreu no meio não deixe a conversa travada pra sempre.

alter table public.support_conversas
  add column if not exists ia_lock_ate timestamptz;

create or replace function public.support_ia_lock(p_phone text, p_segundos int default 240)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  with pegou as (
    update support_conversas
       set ia_lock_ate = now() + make_interval(secs => p_segundos)
     where wa_phone = p_phone
       and (ia_lock_ate is null or ia_lock_ate < now())
    returning 1
  )
  select exists (select 1 from pegou);
$$;

create or replace function public.support_ia_unlock(p_phone text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update support_conversas set ia_lock_ate = null where wa_phone = p_phone;
$$;

revoke all on function public.support_ia_lock(text, int) from public, anon, authenticated;
revoke all on function public.support_ia_unlock(text) from public, anon, authenticated;
grant execute on function public.support_ia_lock(text, int) to service_role;
grant execute on function public.support_ia_unlock(text) to service_role;
