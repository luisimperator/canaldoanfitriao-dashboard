-- Receita de YouTube entra pela conta pessoal do Rômulo e é repassada pra
-- empresa por Pix, 1x por mês, na faixa de R$ 3 a 6 mil. No extrato aparece
-- como "Pix recebido — Romulo Villela Ponte", indistinguível de qualquer
-- outro Pix dele — e ele também manda valores grandes e avulsos que NÃO são
-- receita (R$ 47.756 em jan/26, R$ 76.276 em 02/mar/26 — este último bate no
-- centavo com o "Pix enviado devolvido" de mesmo valor, ou seja, ida e volta).
--
-- Casar só pelo nome jogaria R$ 141 mil de movimentação de sócio dentro do
-- faturamento. Por isso a regra ganha faixa de valor.

alter table public.fin_rules add column if not exists valor_min numeric;
alter table public.fin_rules add column if not exists valor_max numeric;

comment on column public.fin_rules.valor_min is
  'Piso do valor pra regra casar (inclusivo). Null = sem piso.';
comment on column public.fin_rules.valor_max is
  'Teto do valor pra regra casar (inclusivo). Null = sem teto.';

create or replace function public.fin_reclassificar()
returns jsonb
language plpgsql
volatile security definer
set search_path to 'public'
as $$
declare
  afetados int;
  sem_categoria int;
begin
  -- só mexe no que não foi classificado na mão
  update fin_transactions t set category_id = null
  where t.category_source = 'rule' and t.category_id is not null;

  -- a regra de menor prioridade que casar vence. Tem que ser distinct on num
  -- CTE: o alvo do UPDATE não pode ser referenciado de dentro de um LATERAL.
  with match as (
    select distinct on (t.id) t.id, fr.category_id
    from fin_transactions t
    join fin_rules fr
      on t.description ilike fr.padrao
     and (fr.direction is null or fr.direction = t.direction)
     and (fr.valor_min is null or t.amount >= fr.valor_min)
     and (fr.valor_max is null or t.amount <= fr.valor_max)
    where t.category_source = 'rule'
    order by t.id, fr.prioridade, fr.criada_em
  )
  update fin_transactions t
  set category_id = m.category_id
  from match m
  where m.id = t.id;

  get diagnostics afetados = row_count;
  select count(*) into sem_categoria from fin_transactions where category_id is null;

  return jsonb_build_object('classificados', afetados, 'sem_categoria', sem_categoria);
end;
$$;

insert into public.fin_categories (slug, group_name, name, kind)
values ('youtube', 'Receitas', 'YouTube (repasse do Rômulo)', 'receita')
on conflict (slug) where slug is not null do update
  set group_name = excluded.group_name,
      name       = excluded.name,
      kind       = excluded.kind;

-- Faixa 1k–8k, não 3k–6k cravado: os meses observados vão de R$ 2.224 a
-- R$ 6.662, então a banda estreita perderia as pontas. O primeiro valor fora
-- dela é R$ 9.302, com folga.
insert into public.fin_rules (prioridade, padrao, direction, valor_min, valor_max, category_id)
select 32, '%ROMULO%PONTE%', 'in', 1000, 8000, id
from public.fin_categories where slug = 'youtube'
and not exists (
  select 1 from public.fin_rules
  where padrao = '%ROMULO%PONTE%' and direction = 'in' and valor_max = 8000
);

select public.fin_reclassificar();
