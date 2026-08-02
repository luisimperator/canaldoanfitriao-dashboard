-- Ivanildo cuida do atendimento e tinha 4 das 5 abas de Suporte: faltava
-- /suporte/avisos, justamente onde ficam os templates que ele precisa quando a
-- janela de 24h do WhatsApp fecha e só template aprovado entrega.
--
-- Concedido explicitamente, aba por aba: canAccess() casa a aba exata e não
-- herda da aba-pai (ver 0035).

update public.app_access
set tabs = (
  select array(
    select distinct unnest(
      tabs || '{/suporte,/suporte/inbox,/suporte/simulador,/suporte/treinamento,/suporte/avisos}'::text[]
    )
  )
)
where email = 'ivanildopereira.jr@gmail.com';
