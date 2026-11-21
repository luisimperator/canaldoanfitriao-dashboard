-- Vendido pelo time (Fernando, 21/11: "precisa ter no topo quanto foi vendido,
-- tipo o painel calls, mas abrangendo tudo que qualquer vendedor tenha
-- vendido, por email, mensagem, whatsapp ou call").
--
-- Uma linha por venda do período (Eduzz pelo dia da venda; TMB pelo dia em que
-- foi efetivada) que tem dono no time:
--  - link do vendedor: a UTM do link (diego/flavio/breno… vira seller_id na
--    Eduzz; na TMB vem em utm_source/utm_last_source). É o que o vendedor manda
--    por WhatsApp, e-mail ou mensagem. UTM "teo" = Téo (IA);
--  - call: a venda que o Painel Calls ligou a uma call do vendedor (e-mail,
--    telefone, nome ou ligação manual), mesmo sem UTM.
-- canal: 'link', 'call' ou 'link+call'. Vendas sem dono (orgânico, Max, LP)
-- ficam de fora.
create or replace function public.vendas_do_time(p_de date, p_ate date)
returns table (venda_id text, origem text, dia date, valor numeric, produto text, vendedor text, canal text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with sel as (
    select s.name,
           lower(translate(split_part(s.name, ' ', 1), 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeiooooucAAAAEEIOOOOUC')) slug
      from public.sellers s
  ),
  ed as (
    select 'sales:' || s.id::text venda_id, case when s.fonte = 'asaas' then 'Asaas' else 'Eduzz' end origem,
           s.sale_date::date dia, coalesce(s.preco, s.amount)::numeric valor, s.product produto, s.created_at quando,
           coalesce(se.name, case when lower(coalesce(s.utm->>'source', '')) = 'teo' then 'Téo' end) dono_link
      from public.sales s
      left join public.sellers se on se.id = s.seller_id
     where s.status = 'paga' and s.sale_date between p_de and p_ate
  ),
  tm as (
    select 'tmb:' || p.pedido_id::text, 'TMB', p.data_efetivado::date, p.valor_total, p.lancamento,
           coalesce(p.criado_em, p.updated_at),
           case when u.slug = 'teo' then 'Téo' else (select sel.name from sel where sel.slug = u.slug limit 1) end
      from public.tmb_pedidos_raw p
      cross join lateral (select lower(coalesce(nullif(p.data->>'utm_source', ''), nullif(p.data->>'utm_last_source', ''), '')) slug) u
     where p.status_pedido = 'Efetivado' and p.data_efetivado::date between p_de and p_ate
  ),
  todas as (select * from ed union all select * from tm),
  calls as (
    select c.vendedor, c.venda_origem, c.venda_em, c.venda_valor
      from public.painel_calls(((p_de - 7)::timestamp at time zone 'America/Sao_Paulo'),
                               ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')) c
     where c.venda_valor is not null and c.vendedor is not null
  )
  select t.venda_id, t.origem, t.dia, t.valor, t.produto,
         coalesce(t.dono_link, k.vendedor) vendedor,
         case when t.dono_link is not null and k.vendedor is not null then 'link+call'
              when t.dono_link is not null then 'link' else 'call' end canal
    from todas t
    left join lateral (
      select c.vendedor from calls c
       where c.venda_origem = t.origem and round(c.venda_valor) = round(t.valor)
         and (c.venda_em = t.quando or (c.venda_em at time zone 'America/Sao_Paulo')::date = t.dia)
       order by (c.venda_em = t.quando) desc
       limit 1
    ) k on true
   where coalesce(t.dono_link, k.vendedor) is not null;
$function$;
revoke all on function public.vendas_do_time(date, date) from public, anon, authenticated;
