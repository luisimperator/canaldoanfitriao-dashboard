-- Comprador da Imersão não fala com o Téo (Fernando, 25/11: "Quem compra
-- imersão tem que só fazer a imersão, não tem que fazer call").
--
-- No modo Black, todo mundo que escreve no WhatsApp entra no Téo. Quem comprou
-- o ingresso da Imersão pede o link de acesso, a automação responde e o Téo
-- pegava a conversa logo depois e marcava call (Sandra, 25/11). Agora, da
-- compra até o domingo da turma, o Téo não entra e sai de quem já estava com ele.
-- Depois da Imersão, se a pessoa escrever, volta a ser um lead normal.

create or replace function public.teo_imersao_pendente(p_telefone text, p_email text default null)
returns date
language sql
stable
security definer
set search_path to 'public'
as $$
  -- Casa pelos 8 últimos dígitos do telefone (com ou sem o 9 e o DDI) ou pelo e-mail.
  select min(turma_data)
  from imersao_compradores
  where status = 'pago'
    and turma_data + 1 >= (now() at time zone 'America/Sao_Paulo')::date
    and (
      (length(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) >= 8
       and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8)
           = right(regexp_replace(p_telefone, '\D', '', 'g'), 8))
      or (p_email is not null and lower(email) = lower(p_email))
    );
$$;

revoke all on function public.teo_imersao_pendente(text, text) from public, anon, authenticated;

-- Quem já está com o Téo (abrindo ou conversando) sai agora. Quem está com o
-- time (call marcada, vendedor, suporte) fica onde está.
with fechadas as (
  update public.teo_conversas
     set estado = 'encerrado', motivo_humano = 'imersao', proxima_checagem = null, atualizado_em = now()
   where estado in ('novo', 'em_conversa')
     and public.teo_imersao_pendente(telefone) is not null
  returning contact_id, nome
)
insert into public.webhook_log (source, note, body)
select 'teo', 'comprador da Imersão: o Téo sai', jsonb_build_object('contact_id', contact_id, 'nome', nome, 'origem', 'migração 0151')
from fechadas;
