-- Téo: fechamento em call de cada vendedor, pra desempatar a divisão das
-- calls do dia (que é igual entre os vendedores). Conta as calls do Téo que
-- aconteceram (com gravação no Teams: call_transcricoes.status = 'ok') nos
-- últimos p_dias e, delas, quantas viraram venda paga (Eduzz ou TMB) no e-mail
-- do convite em até 7 dias depois da call. Falta e call fora do sistema não
-- entram.

create or replace function public.teo_fechamento_em_call(p_dias int default 90)
returns table (vendedor text, calls bigint, fechamentos bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  with calls as (
    select k.vendedor, lower(k.email) as email, k.inicio
      from teo_calls k
      join call_transcricoes t on t.teo_call_id = k.id and t.status = 'ok'
     where k.status <> 'cancelada'
       and k.vendedor is not null
       and k.inicio < now()
       and k.inicio > now() - make_interval(days => p_dias)
  ),
  vendas as (
    select lower(buyer_email) as email, created_at as quando from sales where status = 'paga'
    union all
    select lower(email), recebido_em from tmb_eventos where evento = 'vendas' and status = 'Efetivado'
  )
  select c.vendedor,
         count(*) as calls,
         count(*) filter (where exists (
           select 1 from vendas v
            where v.email = c.email
              and v.quando >= c.inicio
              and v.quando < c.inicio + interval '7 days'
         )) as fechamentos
    from calls c
   group by c.vendedor;
$$;

revoke all on function public.teo_fechamento_em_call(int) from public, anon, authenticated;
grant execute on function public.teo_fechamento_em_call(int) to service_role;
