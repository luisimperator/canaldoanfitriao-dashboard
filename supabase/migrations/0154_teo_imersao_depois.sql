-- Quem fez a Imersão há poucos dias não recebe call (Fernando, 26/11, na
-- triagem dos leads: "Imersão sem call até 7 dias depois"; desde 05/11 foram 0
-- vendas em 9 calls com quem tinha acabado de fazer a Imersão). Do domingo do
-- evento até 7 dias depois, o Téo conversa e vende por mensagem; call só se a
-- pessoa pedir. Antes do evento continua valendo teo_imersao_pendente (0151):
-- o Téo nem entra.

create or replace function public.teo_imersao_depois(p_telefone text)
returns date
language sql
stable
security definer
set search_path to 'public'
as $$
  select max(turma_data)
  from imersao_compradores
  where status = 'pago'
    and (now() at time zone 'America/Sao_Paulo')::date between turma_data + 2 and turma_data + 8
    and length(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) >= 8
    and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8)
        = right(regexp_replace(p_telefone, '\D', '', 'g'), 8);
$$;

revoke all on function public.teo_imersao_depois(text) from public, anon, authenticated;
