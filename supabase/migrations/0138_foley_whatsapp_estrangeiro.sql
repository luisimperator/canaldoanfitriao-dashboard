-- WhatsApp estrangeiro (Fernando, 20/11, depois do Rudson): o Foley manda o
-- número do grupo com o código do país (1 240..., 33 6...), e a Eduzz às vezes
-- guarda sem ele (240...). A regra não casava e a pessoa vinha como nao_achei:
-- o Rudson, com assinatura do A5E ativa até 02/2027, saiu do grupo em 20/11.
--
-- Agora, quem vem como nao_achei com número que não começa com 55 é consultado
-- de novo sem o código do país (1, 2 ou 3 dígitos, sobrando 10 ou mais). Se
-- alguma dessas achar a pessoa, vale essa resposta (a de menos dígitos tirados
-- primeiro), com o telefone original e "(número sem o DDI)" na fonte.
-- A pausa (0135/0137) continua igual, aplicada depois.
create or replace function public.foley_situacao(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '60000'
as $function$
declare
  v jsonb;
  v_pausado boolean;
  v_alt jsonb;
  v_alt_res jsonb;
begin
  v := public.foley_situacao_regra(p_itens);

  select jsonb_agg(jsonb_build_object(
           'o', b.o,
           'k', k.k,
           'item', jsonb_build_object(
             'telefone', substr(b.d, k.k + 1),
             'grupo', b.x->>'grupo',
             'email', p_itens->((b.o - 1)::int)->>'email'))
         order by b.o, k.k)
    into v_alt
  from (select x, o, regexp_replace(regexp_replace(coalesce(x->>'telefone', ''), '\D', '', 'g'), '^0+', '') d
          from jsonb_array_elements(v) with ordinality a(x, o)) b
  cross join generate_series(1, 3) k(k)
  where b.x->>'decisao' = 'nao_achei'
    and b.d !~ '^55'
    and length(b.d) - k.k >= 10;

  if v_alt is not null then
    v_alt_res := public.foley_situacao_regra(
      (select jsonb_agg(e->'item' order by n) from jsonb_array_elements(v_alt) with ordinality t(e, n)));
    select coalesce(jsonb_agg(coalesce(m.y, b.x) order by b.o), '[]'::jsonb)
      into v
      from jsonb_array_elements(v) with ordinality b(x, o)
      left join lateral (
        select r.y || jsonb_build_object(
                 'telefone', b.x->'telefone',
                 'fonte', coalesce(r.y->>'fonte', '') || ' (número sem o DDI)')
          from jsonb_array_elements(v_alt) with ordinality t(e, n)
          join jsonb_array_elements(v_alt_res) with ordinality r(y, n2) on r.n2 = t.n
         where (t.e->>'o')::bigint = b.o
           and r.y->>'decisao' <> 'nao_achei'
         order by (t.e->>'k')::int
         limit 1
      ) m(y) on true;
  end if;

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
