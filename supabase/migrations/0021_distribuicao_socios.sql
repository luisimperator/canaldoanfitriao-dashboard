-- Distribuição dos sócios: valor vivo até o fechamento, split por sócio e
-- baixa automática pelo extrato.
--
-- Regras combinadas:
--  * A transferência sai no dia 10; se cair em fim de semana, no dia útil
--    seguinte (segunda).
--  * O valor NÃO é congelado no começo do mês — fica recalculando com os dados
--    vivos (patrocínio que entra no dia 7 tem que contar no bolo do dia 10).
--    Só CRAVA no dia útil anterior à transferência (dia 9; se a transferência
--    é segunda, crava na sexta).
--  * Quando o Pix sai de verdade pro Rômulo / Luis Fernando em ±5 dias da
--    data, isso É a distribuição — baixa sozinho, sem cadastro manual.

-- Dia útil: fim de semana anda pra frente (direcao > 0) ou pra trás.
create or replace function public.dia_util(d date, direcao int default 1)
returns date language sql immutable as $$
  select case extract(isodow from d)::int
    when 6 then d + (case when direcao > 0 then 2 else -1 end)
    when 7 then d + (case when direcao > 0 then 1 else -2 end)
    else d end;
$$;

-- Próxima data de distribuição (>= p_ref), já ajustada pro dia útil.
create or replace function public.distribuicao_data(p_ref date default current_date)
returns date language sql stable as $$
  with cfg as (select dia_distribuicao as dia from politica_caixa where id = 1),
  este as (
    select public.dia_util(date_trunc('month', p_ref)::date + ((select dia from cfg) - 1), 1) as d
  )
  select case when (select d from este) >= p_ref then (select d from este)
    else public.dia_util(
      (date_trunc('month', p_ref) + interval '1 month')::date + ((select dia from cfg) - 1), 1)
  end;
$$;

-- Sócios e o rateio. match_extrato é regex sobre a descrição do Inter.
create table if not exists public.distribuicao_socios (
  id smallint primary key,
  nome text not null,
  destino text,                       -- pra onde o dinheiro vai de fato
  percentual numeric not null,
  match_extrato text not null,
  ordem smallint not null default 0
);
alter table public.distribuicao_socios enable row level security;

insert into public.distribuicao_socios (id, nome, destino, percentual, match_extrato, ordem)
values
  (1, 'Heavy Drops', 'conta pessoal do Luis Fernando', 0.40,
   '(luis fernando|luiz fernando|heavy ?drops)', 1),
  (2, 'Rômulo Villela', 'conta do Rômulo', 0.60, 'romulo', 2)
on conflict (id) do update set
  nome = excluded.nome, destino = excluded.destino,
  percentual = excluded.percentual, match_extrato = excluded.match_extrato,
  ordem = excluded.ordem;

-- Snapshot do valor cravado (um por competência).
create table if not exists public.distribuicao_fechamento (
  competencia date primary key,       -- 1º dia do mês da distribuição
  data_distribuicao date not null,
  valor numeric not null,
  fechado_em timestamptz not null default now(),
  fechado_por text                    -- 'auto' (cron) ou e-mail de quem cravou
);
alter table public.distribuicao_fechamento enable row level security;

-- Transferências reais pros sócios em ±p_janela dias da data (a partir de
-- p_minimo, pra não confundir reembolso pequeno com distribuição).
create or replace function public.distribuicao_realizada(
  p_data date, p_janela int default 5, p_minimo numeric default 5000
)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with mov as (
    select s.id, s.nome, t.transaction_date as dia, t.amount as valor,
           coalesce(nullif(trim(t.counterparty), ''), t.description) as quem
    from distribuicao_socios s
    join fin_transactions t
      on t.direction = 'out'
     and t.amount >= p_minimo
     and t.transaction_date between p_data - p_janela and p_data + p_janela
     and (coalesce(t.counterparty, '') || ' ' || coalesce(t.description, '')) ~* s.match_extrato
  )
  select jsonb_build_object(
    'total', coalesce(round(sum(valor), 2), 0),
    'primeira_data', min(dia),
    'ultima_data', max(dia),
    'por_socio', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'valor', round(v, 2),
                                          'data', d) order by id)
      from (select id, nome, sum(valor) as v, min(dia) as d from mov group by 1, 2) x
    ), '[]'::jsonb),
    'lancamentos', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'valor', round(valor, 2), 'quem', quem)
                       order by dia, valor desc) from mov
    ), '[]'::jsonb)
  ) from mov;
$$;

-- Status completo da distribuição: prévia (vivo) → cravado → pago.
create or replace function public.distribuicao_status(p_ref date default current_date)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with alvo as (select public.distribuicao_data(p_ref) as data_dist),
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
  valor as (
    select coalesce(
      (select valor from snap),                        -- cravado manda
      round(((select j from pol)->>'a_distribuir')::numeric, 2)
    ) as v
  )
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
    'valor_vivo', round(((select j from pol)->>'a_distribuir')::numeric, 2),
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

-- Crava o valor da competência (idempotente). Chamado pelo cron no dia do
-- fechamento e pelo botão da página.
create or replace function public.distribuicao_fechar(
  p_ref date default current_date, p_por text default 'auto'
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_st jsonb; v_comp date; v_data date; v_valor numeric;
begin
  v_st := distribuicao_status(p_ref);
  v_comp := (v_st->>'competencia')::date;
  v_data := (v_st->>'data_distribuicao')::date;
  v_valor := (v_st->>'valor_vivo')::numeric;
  insert into distribuicao_fechamento (competencia, data_distribuicao, valor, fechado_por)
  values (v_comp, v_data, v_valor, p_por)
  on conflict (competencia) do nothing;
  return distribuicao_status(p_ref);
end;$$;

-- Todo dia 12h BRT: se hoje é o dia do fechamento, crava sozinho.
select cron.schedule('fechar-distribuicao', '0 15 * * *', $$
  select public.distribuicao_fechar(current_date, 'auto')
  where current_date = (public.distribuicao_status(current_date)->>'data_fechamento')::date
$$);
