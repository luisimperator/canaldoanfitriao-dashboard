-- Fechamento cravado e ainda não pago continua na tela.
--
-- distribuicao_status() sempre olhou pra frente: pega a próxima data de
-- distribuição da política (dia 10) e mostra o ciclo dela. Passou o dia 10,
-- o card vira pro mês seguinte — mesmo que o Pix do mês atual ainda não
-- tenha saído.
--
-- Setembro/2026 escancarou isso: o fechamento foi recravado à mão pra
-- distribuir no dia 15 (R$ 66.000), e desde o dia 11 o card mostrava a
-- prévia de outubro. O dinheiro que estava pra sair hoje não aparecia em
-- lugar nenhum.
--
-- Regra nova: se existe um fechamento de competência anterior ao ciclo da
-- política que ainda não foi pago (extrato não deu baixa no valor cravado),
-- ele é o que aparece — até a véspera do fechamento do ciclo seguinte.
-- Nesse dia a política volta a mandar, porque é o cron de distribuicao_fechar()
-- que precisa enxergar o ciclo novo pra cravar. Nada muda no fechamento em si.

create or replace function public.distribuicao_status(p_ref date default current_date)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with cfg as (select arredondamento_distribuicao as passo from politica_caixa where id = 1),
  ciclo as (
    select public.distribuicao_data(p_ref) as data_dist,
           public.dia_util(public.distribuicao_data(p_ref) - 1, -1) as data_fechamento
  ),
  pendente as (
    -- cravado, de competência anterior ao ciclo da política, sem baixa no extrato
    select f.competencia, f.data_distribuicao
    from distribuicao_fechamento f, ciclo c
    where f.competencia < date_trunc('month', c.data_dist)::date
      and f.data_distribuicao >= p_ref - 60
      and p_ref < c.data_fechamento
      and coalesce((public.distribuicao_realizada(f.data_distribuicao)->>'total')::numeric, 0) < f.valor
    order by f.competencia desc
    limit 1
  ),
  datas as (
    select coalesce(pe.data_distribuicao, c.data_dist) as data_dist,
           coalesce(pe.competencia, date_trunc('month', c.data_dist)::date) as competencia,
           public.dia_util(coalesce(pe.data_distribuicao, c.data_dist) - 1, -1) as data_fechamento
    from ciclo c left join pendente pe on true
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
$function$;
