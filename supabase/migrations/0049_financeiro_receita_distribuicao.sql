-- Financeiro: receita, distribuição e margem — e a classificação parando de
-- apodrecer sozinha.
--
-- Dois problemas, um sintoma só (a tela de Financeiro mentindo):
--
-- 1) A classificação estava CONGELADA. `fin_reclassificar()` existe desde
--    sempre, mas nada nunca a chamava: não está no código do app, não está no
--    cron. Alguém rodava na mão. O `sync_inter` roda de 30 em 30 minutos e
--    despeja linha nova sem categoria nenhuma.
--
--    Em agosto/2026: 34 das 35 transações sem categoria, R$ 261.253 de saída
--    caindo em "Sem categoria" — o terceiro maior "gasto" do gráfico era, na
--    verdade, o gráfico não sabendo o que era cada coisa. Pior: a distribuição
--    aos sócios de agosto (R$ 44.400 + R$ 66.600 = R$ 111.000, exatamente o
--    valor cravado em distribuicao_fechamento) simplesmente não existia em
--    nenhum relatório. Dava para concluir que não houve distribuição no mês.
--
--    A regra já casava — `%ROMULO%PONTE%` bate em "Pix enviado — Romulo
--    Villela Ponte" sem esforço. Só ninguém tinha mandado casar.
--
--    Agora classifica no INSERT, por gatilho. Não tem job para esquecer de
--    rodar nem defasagem entre o sync e o relatório.
--
-- 2) Não havia lugar nenhum que respondesse "quanto entrou, quanto saiu pros
--    sócios, e que porcentagem isso é". A tela só tinha entradas e saídas do
--    extrato do Inter — que é caixa, não é faturamento: uma venda parcelada na
--    Eduzz pinga no banco durante meses, e a distribuição de um mês paga o
--    resultado do mês anterior. Somar os dois na mesma coluna não dá margem
--    de nada.
--
--    `resultado_mensal()` casa as três coisas na competência certa.

-- ---------------------------------------------------------------------------
-- 1. Classificação automática
-- ---------------------------------------------------------------------------

create or replace function public.fin_categoria_por_regra(
  p_desc text, p_direction text, p_amount numeric
) returns uuid
 language sql
 stable
 set search_path to 'public'
as $function$
  select fr.category_id
    from fin_rules fr
   where p_desc ilike fr.padrao
     and (fr.direction is null or fr.direction = p_direction)
     and (fr.valor_min is null or p_amount >= fr.valor_min)
     and (fr.valor_max is null or p_amount <= fr.valor_max)
   order by fr.prioridade, fr.criada_em
   limit 1;
$function$;

create or replace function public.fin_classificar_linha()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  -- category_source = 'manual' é decisão de gente: o gatilho não passa por cima.
  if coalesce(new.category_source, 'rule') = 'rule' then
    new.category_id := public.fin_categoria_por_regra(
      new.description, new.direction, new.amount);
  end if;
  return new;
end;
$function$;

drop trigger if exists fin_transactions_classifica on fin_transactions;
create trigger fin_transactions_classifica
  before insert or update of description, direction, amount, category_source
  on fin_transactions
  for each row execute function public.fin_classificar_linha();

-- Mesma conta do gatilho, para a varredura em lote não divergir da linha a linha.
create or replace function public.fin_reclassificar()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  afetados int;
  sem_categoria int;
begin
  update fin_transactions t
     set category_id = public.fin_categoria_por_regra(t.description, t.direction, t.amount)
   where t.category_source = 'rule'
     and t.category_id is distinct from
         public.fin_categoria_por_regra(t.description, t.direction, t.amount);

  get diagnostics afetados = row_count;
  select count(*) into sem_categoria from fin_transactions where category_id is null;

  return jsonb_build_object('classificados', afetados, 'sem_categoria', sem_categoria);
end;
$function$;

-- Põe em dia o atraso acumulado desde a última vez que rodaram isso na mão.
select public.fin_reclassificar();

-- ---------------------------------------------------------------------------
-- 2. Receita × distribuição × margem, mês a mês
-- ---------------------------------------------------------------------------
--
-- Faturamento é venda paga, na data em que foi paga (Eduzz por paidAt, Asaas
-- por data de crédito) — não é o que pingou no banco naquele mês.
--
-- A distribuição sai no dia útil combinado do mês SEGUINTE ao resultado que
-- ela remunera: o que se distribui em agosto é o julho que fechou. Por isso a
-- margem divide `distribuicao_m1` pelo faturamento do mês, e não a
-- distribuição paga dentro do próprio mês — essa fica na tabela também, mas só
-- para conferir com o extrato.
--
-- `fechado` marca se o mês seguinte já passou pela data de distribuição. Sem
-- isso, todo mês recente apareceria com margem 0% em vez de "ainda não saiu".

create or replace function public.resultado_mensal(p_meses integer default 12)
 returns table(
   mes date,
   faturamento numeric,
   eduzz numeric,
   asaas numeric,
   liquido numeric,
   distribuicao numeric,
   distribuicao_m1 numeric,
   margem numeric,
   fechado boolean
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with meses as (
    select generate_series(
             date_trunc('month', current_date) - make_interval(months => greatest(p_meses, 1) - 1),
             date_trunc('month', current_date),
             interval '1 month')::date as mes
  ),
  ed as (
    select date_trunc('month',
             (data->>'paidAt')::timestamptz at time zone 'America/Sao_Paulo')::date as mes,
           sum((data->'total'->>'value')::numeric)   as bruto,
           sum((data->'netGain'->>'value')::numeric) as liquido
      from eduzz_sales_raw
     where status = 'paid' and data->>'paidAt' is not null
     group by 1
  ),
  as_ as (
    select date_trunc('month', asaas_data_venda(confirmed_date, payment_date))::date as mes,
           sum(valor) as bruto
      from asaas_cobrancas
     where status in ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')
       and asaas_data_venda(confirmed_date, payment_date) is not null
     group by 1
  ),
  dist as (
    select date_trunc('month', t.transaction_date)::date as mes, sum(t.amount) as valor
      from fin_transactions t
      join fin_categories c on c.id = t.category_id
     where t.direction = 'out' and c.name = 'Distribuição aos sócios'
     group by 1
  )
  select m.mes,
         round(coalesce(e.bruto, 0) + coalesce(a.bruto, 0), 2) as faturamento,
         round(coalesce(e.bruto, 0), 2)   as eduzz,
         round(coalesce(a.bruto, 0), 2)   as asaas,
         round(coalesce(e.liquido, 0) + coalesce(a.bruto, 0), 2) as liquido,
         round(coalesce(d.valor, 0), 2)   as distribuicao,
         round(coalesce(d1.valor, 0), 2)  as distribuicao_m1,
         case
           when coalesce(e.bruto, 0) + coalesce(a.bruto, 0) <= 0 then null
           when d1.valor is null
            and (m.mes + interval '1 month')::date
                >= date_trunc('month', current_date)::date then null
           else round(100 * coalesce(d1.valor, 0)
                          / (coalesce(e.bruto, 0) + coalesce(a.bruto, 0)), 1)
         end as margem,
         (d1.valor is not null
          or (m.mes + interval '1 month')::date < date_trunc('month', current_date)::date
         ) as fechado
    from meses m
    left join ed   e  on e.mes  = m.mes
    left join as_  a  on a.mes  = m.mes
    left join dist d  on d.mes  = m.mes
    left join dist d1 on d1.mes = (m.mes + interval '1 month')::date
   order by m.mes;
$function$;

revoke all on function public.resultado_mensal(integer) from public, anon;
grant execute on function public.resultado_mensal(integer) to authenticated, service_role;
