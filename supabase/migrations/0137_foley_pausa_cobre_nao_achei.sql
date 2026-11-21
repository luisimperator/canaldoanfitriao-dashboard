-- A pausa das remoções (0135) só trocava sai/sai_agora por "pausado". O robô
-- do Foley também tira quem vem como nao_achei (Fernando, 18/11: "não achei"
-- sai pela fila normal), e em 20/11 às 21h tirou 2 assim com a pausa ligada.
-- Pausado = ninguém sai: nao_achei também vira "pausado" (decisao_regra guarda
-- a decisão da regra).
create or replace function public.foley_situacao(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
  v_pausado boolean;
begin
  v := public.foley_situacao_regra(p_itens);
  select coalesce(pausado, false) into v_pausado from public.foley_config where id = 1;
  if coalesce(v_pausado, false) then
    select coalesce(jsonb_agg(
             case when x->>'decisao' in ('sai', 'sai_agora', 'nao_achei') then
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
