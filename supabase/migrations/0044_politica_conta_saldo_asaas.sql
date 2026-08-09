-- Política de distribuição: contar também o saldo parado no Asaas.
--
-- A política somava Inter + Eduzz + saque em trânsito (0043) e ignorava o
-- Asaas. Na prática quase não muda o número, porque a raspagem (0039/0040)
-- varre o Asaas todo dia às 19h40 e só deixa o colchão lá — mas ignorar é
-- errado do mesmo jeito, e é uma inconsistência com o card de provisão, que
-- soma o Asaas no "disponível agora". Se um dia a raspagem falhar, ou o
-- dinheiro cair depois da janela, a política vai enxergar.
--
-- O problema é de onde vem o número: o saldo do Asaas mora numa chamada REST
-- (/finance/balance) que só o app sabe fazer — a chave fica na Vercel. Então
-- o app grava um retrato aqui e o SQL lê o retrato.
--
-- Quem grava:
--   - o sync do Asaas, de hora em hora no minuto :40 (cron sync-asaas, 0031);
--   - a raspagem, logo depois de transferir — aí o retrato já nasce com o
--     resíduo (o colchão), sem esperar a próxima hora cheia.
--
-- Por que a janela de frescor: o retrato envelhecido é PERIGOSO, não só
-- inútil. Quando o Pix da raspagem pinga no Inter, o extrato sobe; se o
-- retrato do Asaas ainda for o de antes da varrida, o mesmo dinheiro conta
-- duas vezes e o bolo infla. Fora da janela o valor vira zero — que é
-- exatamente o comportamento de hoje, o lado seguro do erro.

create table if not exists public.asaas_saldo (
  id smallint primary key default 1 check (id = 1),
  saldo numeric(14,2) not null,
  atualizado_em timestamptz not null default now(),
  origem text
);
comment on table public.asaas_saldo is
  'Retrato do saldo liquidado no Asaas, gravado pelo app (sync de hora em hora e pós-raspagem). Linha única.';

-- RLS sem policy: só a service role (que bypassa RLS) lê/escreve.
alter table public.asaas_saldo enable row level security;

create or replace function public.politica_distribuicao(p_data date default current_date)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with cfg as (select * from politica_caixa where id = 1),
  horizonte as (
    select (date_trunc('month', p_data) + ((select horizonte_meses from cfg) || ' months')::interval
            - interval '1 day')::date as fim
  ),
  prov as (select provisao_caixa() as j),
  caixa as (
    select (j->>'saldo_inter')::numeric
         + coalesce((j->'saldo_eduzz_extrato'->>'valor')::numeric, 0)
         -- dinheiro nosso que saiu da Eduzz e ainda não pingou no Inter
         + coalesce((j->>'saques_transito_total')::numeric, 0)
         -- saldo parado no Asaas; retrato velho não vale (viraria contagem
         -- dupla com o Inter depois que a raspagem cai lá)
         + coalesce((select s.saldo from asaas_saldo s
                     where s.id = 1 and s.atualizado_em > now() - interval '3 hours'), 0) as hoje
    from prov
  ),
  entradas as (
    select (d->>'dia')::date as dia, (d->>'valor')::numeric as valor
    from prov, jsonb_array_elements(j->'pago_por_dia') d
    union all
    select (d->>'dia')::date, (d->>'valor')::numeric
    from prov, jsonb_array_elements(j->'a_vencer_por_dia') d
  ),
  saidas_cad as (
    select (s->>'data')::date as dia, (s->>'valor')::numeric as valor
    from prov, jsonb_array_elements(j->'saidas_programadas') s
  ),
  rotina as (select despesa_rotina_mensal() / 30.0 as por_dia),
  nova as (select entrada_liquida_diaria() * (select fator_receita_nova from cfg) as por_dia),
  dias as (select generate_series(current_date, (select fim from horizonte), interval '1 day')::date as dia),
  curva as (
    select d.dia,
      (select hoje from caixa)
      + coalesce((select sum(valor) from entradas e where e.dia > current_date and e.dia <= d.dia), 0)
      + (select por_dia from nova) * (d.dia - current_date)
      - coalesce((select sum(valor) from saidas_cad s where s.dia > current_date and s.dia <= d.dia), 0)
      - (select por_dia from rotina) * (d.dia - current_date) as saldo
    from dias d
  ),
  vale as (
    select min(saldo) as menor, (array_agg(dia order by saldo))[1] as dia_menor
    from curva where dia >= p_data
  ),
  caixa_na_data as (select saldo from curva where dia = p_data),
  reserva_anterior as (
    select (select reserva_inicial from cfg) + coalesce(sum(valor), 0) as acumulada
    from reserva_mensal where mes < date_trunc('month', p_data)::date
  ),
  colchao as (
    select greatest((select acumulada from reserva_anterior), (select piso_operacional from cfg)) as exigido
  ),
  bolo as (
    select greatest(round((select menor from vale) - (select exigido from colchao), 2), 0) as total
  ),
  fatias as (
    select
      least(
        round((select total from bolo) * (select percentual_reserva_distribuicao from cfg), 2),
        greatest(round(meta_reserva() - (select acumulada from reserva_anterior), 2), 0)
      ) as para_cofre
  )
  select jsonb_build_object(
    'hoje', current_date,
    'data_distribuicao', p_data,
    'horizonte', (select fim from horizonte),
    'caixa_hoje', round((select hoje from caixa), 2),
    'caixa_na_data', round((select saldo from caixa_na_data), 2),
    'menor_caixa_do_periodo', round((select menor from vale), 2),
    'dia_do_vale', (select dia_menor from vale),
    'despesa_rotina_mes', round(despesa_rotina_mensal(), 2),
    'despesa_total_mes', round(despesa_total_mensal(), 2),
    'entrada_nova_por_dia', round((select por_dia from nova), 2),
    'piso_operacional', (select piso_operacional from cfg),
    'cofre_antes', round((select acumulada from reserva_anterior), 2),
    'colchao_exigido', round((select exigido from colchao), 2),
    'percentual_reserva', (select percentual_reserva_distribuicao from cfg),
    'disponivel_total', (select total from bolo),
    'vai_pro_cofre', (select para_cofre from fatias),
    'a_distribuir', round((select total from bolo) - (select para_cofre from fatias), 2),
    'cofre_depois', round((select acumulada from reserva_anterior) + (select para_cofre from fatias), 2),
    'meta_valor', round(meta_reserva(), 2),
    'progresso_meta', case when meta_reserva() > 0 then round(
      100 * ((select acumulada from reserva_anterior) + (select para_cofre from fatias)) / meta_reserva(), 1)
      else null end,
    'saidas_previstas_periodo', (select coalesce(round(sum(valor)), 0) from saidas_cad where dia >= current_date),
    'entradas_contratadas_periodo', (select coalesce(round(sum(valor)), 0) from entradas where dia > current_date)
  );
$function$;
