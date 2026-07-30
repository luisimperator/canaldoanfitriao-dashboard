-- Arredondamento da distribuição volta pra BAIXO (o troco fica na conta e
-- entra no bolo do mês seguinte, em vez de tirar além do caixa livre), e o
-- cofre passa a ser creditado de verdade no fechamento.
--
-- O furo do cofre: reserva_mensal estava VAZIA. Todo mês o modelo descontava
-- 15% do caixa livre da distribuição, mas não registrava esse valor em lugar
-- nenhum — então no mês seguinte o cofre continuava lendo zero, o colchão
-- exigido nunca subia e a barra da meta nunca andava. Os sócios tiravam menos
-- todo mês sem que a reserva existisse. Agora o crédito acontece no mesmo ato
-- do fechamento.

create or replace function public.distribuicao_status(p_ref date default current_date)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with cfg as (select arredondamento_distribuicao as passo from politica_caixa where id = 1),
  alvo as (select public.distribuicao_data(p_ref) as data_dist),
  datas as (
    select data_dist,
      date_trunc('month', data_dist)::date as competencia,
      public.dia_util(data_dist - 1, -1) as data_fechamento
    from alvo
  ),
  snap as (
    select f.* from distribuicao_fechamento f, datas d where f.competencia = d.competencia
  ),
  pol as (select politica_distribuicao((select data_dist from datas)) as j),
  real_ as (select distribuicao_realizada((select data_dist from datas)) as r),
  bruto as (select round(((select j from pol)->>'a_distribuir')::numeric, 2) as v),
  vivo as (
    select case when coalesce((select passo from cfg), 0) > 0
      then floor((select v from bruto) / (select passo from cfg)) * (select passo from cfg)
      else (select v from bruto) end as v
  ),
  valor as (select coalesce((select valor from snap), (select v from vivo)) as v)
  select jsonb_build_object(
    'hoje', current_date,
    'competencia', (select competencia from datas),
    'data_distribuicao', (select data_dist from datas),
    'data_fechamento', (select data_fechamento from datas),
    'fechado', (select count(*) > 0 from snap),
    'fechado_em', (select fechado_em from snap),
    'fechado_por', (select fechado_por from snap),
    'pode_fechar', current_date >= (select data_fechamento from datas)
                   and not (select count(*) > 0 from snap),
    'valor', (select v from valor),
    'valor_vivo', (select v from vivo),
    'valor_bruto', (select v from bruto),
    'arredondamento', (select passo from cfg),
    -- troco do arredondamento pra baixo: fica na conta
    'sobra_arredondamento', round((select v from bruto) - (select v from vivo), 2),
    'socios', (
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nome', s.nome, 'destino', s.destino,
        'percentual', s.percentual,
        'valor', round((select v from valor) * s.percentual, 2),
        'pago', coalesce((
          select (p->>'valor')::numeric
          from jsonb_array_elements(((select r from real_)->'por_socio')) p
          where (p->>'id')::int = s.id), 0),
        'pago_em', (
          select p->>'data' from jsonb_array_elements(((select r from real_)->'por_socio')) p
          where (p->>'id')::int = s.id)
      ) order by s.ordem)
      from distribuicao_socios s
    ),
    'realizado', (select r from real_),
    'politica', (select j from pol)
  );
$$;

create or replace function public.distribuicao_fechar(
  p_ref date default current_date, p_por text default 'auto'
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_st jsonb; v_pol jsonb;
  v_comp date; v_data date; v_valor numeric;
  v_cofre numeric; v_pct numeric; v_desp numeric;
begin
  v_st := distribuicao_status(p_ref);
  v_pol := v_st->'politica';
  v_comp := (v_st->>'competencia')::date;
  v_data := (v_st->>'data_distribuicao')::date;
  v_valor := (v_st->>'valor_vivo')::numeric;
  v_cofre := coalesce((v_pol->>'vai_pro_cofre')::numeric, 0);
  v_pct := coalesce((v_pol->>'percentual_reserva')::numeric, 0);
  v_desp := coalesce((v_pol->>'despesa_total_mes')::numeric, 0);

  insert into distribuicao_fechamento (competencia, data_distribuicao, valor, fechado_por)
  values (v_comp, v_data, v_valor, p_por)
  on conflict (competencia) do nothing;

  -- só credita o cofre se o fechamento é novo (evita dobrar em re-execução)
  if found and v_cofre > 0 then
    insert into reserva_mensal (mes, despesas_previstas, percentual, valor)
    values (v_comp, v_desp, v_pct, v_cofre)
    on conflict (mes) do nothing;
  end if;

  return distribuicao_status(p_ref);
end;$$;
