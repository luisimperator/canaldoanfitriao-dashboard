-- Pausa das remoções dos grupos (Fernando, 20/11: "Sim, pausa"). O robô de
-- limpeza do Foley consulta /api/foley/situacao antes de tirar cada pessoa e
-- só tira se a resposta for "sai"/"sai_agora". Com foley_config.pausado, a
-- consulta devolve "pausado" no lugar dessas duas (com a decisão da regra em
-- decisao_regra), então ninguém sai. Motivo: o saida_aviso ainda está em
-- análise na Meta e o painel ainda não manda a mensagem de saída (etapa 3).
-- A regra continua em foley_situacao_regra (a de antes, só renomeada), que
-- segue gravando a decisão real em foley_situacao_ultima.
-- Pra despausar: update foley_config set pausado = false where id = 1;

create table if not exists public.foley_config (
  id int primary key default 1 check (id = 1),
  pausado boolean not null default false,
  pausado_em timestamptz,
  motivo text
);
alter table public.foley_config enable row level security;

insert into public.foley_config (id, pausado, pausado_em, motivo)
values (1, true, now(), 'Fernando, 20/11: pausa até o saida_aviso ser aprovado na Meta e o painel mandar a mensagem de saída')
on conflict (id) do update
  set pausado = excluded.pausado, pausado_em = excluded.pausado_em, motivo = excluded.motivo;

alter function public.foley_situacao(jsonb) rename to foley_situacao_regra;
revoke all on function public.foley_situacao_regra(jsonb) from public, anon, authenticated;

create or replace function public.foley_situacao(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v jsonb;
  v_pausado boolean;
begin
  v := public.foley_situacao_regra(p_itens);
  select coalesce(pausado, false) into v_pausado from public.foley_config where id = 1;
  if coalesce(v_pausado, false) then
    select coalesce(jsonb_agg(
             case when x->>'decisao' in ('sai', 'sai_agora') then
               x || jsonb_build_object(
                 'decisao', 'pausado',
                 'decisao_regra', x->>'decisao',
                 'motivo', 'remoções pausadas pelo Fernando (20/11); pela regra: ' || coalesce(x->>'motivo', ''))
             else x end
             order by o), '[]'::jsonb)
      into v
      from jsonb_array_elements(v) with ordinality a(x, o);
  end if;
  return v;
end;
$function$;

revoke all on function public.foley_situacao(jsonb) from public, anon, authenticated;
