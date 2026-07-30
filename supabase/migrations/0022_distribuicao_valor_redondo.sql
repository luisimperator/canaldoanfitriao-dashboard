-- Distribuição em valor redondo, arredondando pra CIMA (decisão do sócio:
-- prioridade é o caixa dos sócios). Passo configurável em politica_caixa,
-- padrão R$ 1.000 — julho, por exemplo, fechou em R$ 50.000 redondos.
--
-- Custo assumido: tira até (passo − 1) além do caixa estritamente livre; com
-- passo de R$ 1.000, no máximo R$ 999 saem por conta do colchão.

alter table public.politica_caixa
  add column if not exists arredondamento_distribuicao numeric not null default 1000;

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
      then ceil((select v from bruto) / (select passo from cfg)) * (select passo from cfg)
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
    -- quanto se tira ALÉM do caixa livre por causa do arredondamento pra cima
    'extra_arredondamento', round((select v from vivo) - (select v from bruto), 2),
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
