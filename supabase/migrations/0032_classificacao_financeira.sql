-- Classificação financeira: dá papel contábil a cada lançamento do extrato.
--
-- O extrato do Inter é dinheiro entrando e saindo — não é DRE. Somar tudo que
-- é 'out' como despesa erra em três lugares que valem muito dinheiro:
--
--   1. Distribuição pros sócios (Pix pro Rômulo / Luis Fernando) NÃO é custo,
--      é destinação do lucro. Em junho/26 são R$ 100.048: descontar isso faz
--      um mês de lucro aparecer como prejuízo de R$ 95 mil.
--   2. Aplicação/resgate de fundo e Pix entre contas próprias não são receita
--      nem despesa — só dinheiro trocando de bolso.
--   3. "Pix enviado devolvido" (R$ 76.276) lançado como saída conta a mesma
--      despesa duas vezes.
--
-- Daí o campo `kind`, que é o que os cálculos leem:
--   receita       entra no faturamento
--   tvc           custo totalmente variável (some do Throughput; ver Goldratt)
--   oe            despesa operacional
--   distribuicao  destinação de lucro — fica FORA do resultado
--   neutro        transferência/aplicação/estorno — fora dos dois lados
--
-- Com isso:  Throughput = receita − tvc      Lucro = Throughput − oe
--
-- A classificação é por REGRA (padrão ILIKE na descrição), reaplicável. Quando
-- alguém reclassifica na mão pela tela, o lançamento fica com
-- category_source='manual' e nenhuma regra encosta nele de novo.

-- ========== categorias ganham papel ==========

alter table public.fin_categories
  drop constraint if exists fin_categories_group_name_check;

alter table public.fin_categories
  add constraint fin_categories_group_name_check
  check (group_name in ('Receitas', 'Despesas', 'Fora do resultado'));

alter table public.fin_categories
  add column if not exists kind text not null default 'oe';

alter table public.fin_categories
  drop constraint if exists fin_categories_kind_check;

alter table public.fin_categories
  add constraint fin_categories_kind_check
  check (kind in ('receita', 'tvc', 'oe', 'distribuicao', 'neutro'));

-- slug estável pras regras referenciarem sem depender do texto do nome
alter table public.fin_categories
  add column if not exists slug text;

create unique index if not exists fin_categories_slug_idx
  on public.fin_categories (slug) where slug is not null;

-- ========== lançamento sabe se foi regra ou mão ==========

alter table public.fin_transactions
  add column if not exists category_source text not null default 'rule';

alter table public.fin_transactions
  drop constraint if exists fin_transactions_category_source_check;

alter table public.fin_transactions
  add constraint fin_transactions_category_source_check
  check (category_source in ('rule', 'manual'));

create index if not exists fin_transactions_category_idx
  on public.fin_transactions (category_id);

-- ========== regras ==========

create table if not exists public.fin_rules (
  id uuid primary key default gen_random_uuid(),
  -- menor roda primeiro; a primeira que casar vence
  prioridade int not null default 100,
  -- padrão ILIKE aplicado na descrição inteira (cobre os dois formatos de
  -- extrato que convivem hoje: "Pix enviado — NOME" e 'Pix enviado: "Cp :1-NOME"')
  padrao text not null,
  -- null = vale pros dois sentidos. Importa porque o mesmo nome aparece dos
  -- dois lados (Rômulo recebe distribuição e às vezes devolve dinheiro).
  direction text check (direction in ('in', 'out')),
  category_id uuid not null references public.fin_categories(id) on delete cascade,
  criada_em timestamptz not null default now()
);

create index if not exists fin_rules_prioridade_idx on public.fin_rules (prioridade);

alter table public.fin_rules enable row level security;

-- ========== seed das categorias ==========

insert into public.fin_categories (slug, group_name, name, kind) values
  ('vendas-eduzz',   'Receitas',          'Vendas (Eduzz)',            'receita'),
  ('patrocinio',     'Receitas',          'Patrocínio e parcerias',    'receita'),
  ('outras-receitas','Receitas',          'Outras receitas',           'receita'),
  ('midia',          'Despesas',          'Mídia paga',                'oe'),
  ('impostos',       'Despesas',          'Impostos',                  'oe'),
  ('equipe',         'Despesas',          'Equipe e prestadores',      'oe'),
  ('agencias',       'Despesas',          'Agências e consultorias',   'oe'),
  ('evento',         'Despesas',          'Eventos e produção',        'oe'),
  ('contabilidade',  'Despesas',          'Contabilidade e jurídico',  'oe'),
  ('logistica',      'Despesas',          'Logística e envio',         'oe'),
  ('cartao',         'Despesas',          'Cartão e tarifas',          'oe'),
  ('outras-despesas','Despesas',          'Outras despesas',           'oe'),
  ('distribuicao',   'Fora do resultado', 'Distribuição aos sócios',   'distribuicao'),
  ('aplicacao',      'Fora do resultado', 'Aplicação e resgate',       'neutro'),
  ('estorno',        'Fora do resultado', 'Estorno e devolução',       'neutro'),
  -- Transferência entre contas próprias fica contando no resultado por decisão
  -- do dono do painel; é só trocar o kind pra 'neutro' na tela de ajuste.
  ('transferencia',  'Receitas',          'Transferência entre contas próprias', 'receita')
-- o índice de slug é parcial (só slug not null), então o ON CONFLICT precisa
-- repetir o predicado pra casar com ele
on conflict (slug) where slug is not null do update
  set group_name = excluded.group_name,
      name       = excluded.name,
      kind       = excluded.kind;

-- ========== seed das regras ==========
-- Tiradas dos favorecidos que de fato aparecem no extrato de 2026. O que não
-- casar fica sem categoria e aparece como "Sem categoria" — igual ao que o
-- painel já faz hoje, só que agora dá pra arrumar pela tela.

insert into public.fin_rules (prioridade, padrao, direction, category_id)
select v.prioridade, v.padrao, v.direction, c.id
from (values
  -- estorno primeiro: "Pix enviado devolvido" também casa com "Pix enviado"
  (10, '%devolvido%',                        null,   'estorno'),

  -- aplicação e conta própria
  (20, '%Aplicacao%',                        'out',  'aplicacao'),
  (20, '%Resgate%',                          'in',   'aplicacao'),
  (20, '%Global Account%',                   null,   'aplicacao'),
  (25, '%CANAL DO ANFITRIAO%',               null,   'transferencia'),

  -- distribuição: só o que SAI pros sócios. O que entra deles é tratado na
  -- migração 0033 (YouTube por faixa de valor).
  (30, '%ROMULO%PONTE%',                     'out',  'distribuicao'),
  (30, '%Luis Fernando de Assis Oliveira%',  'out',  'distribuicao'),
  (35, '%ROMULO%PONTE%',                     'in',   'outras-receitas'),

  -- receita
  (40, '%GALAXY FUNDO DE INVESTIMENTO%',     'in',   'vendas-eduzz'),
  (45, '%TMB %',                             'in',   'patrocinio'),
  (45, '%STAYS%',                            'in',   'patrocinio'),
  (45, '%OWNERPRO%',                         'in',   'patrocinio'),
  (45, '%MATTEX%',                           'in',   'patrocinio'),
  (45, '%ECOHOST%',                          'in',   'patrocinio'),

  -- despesa
  (50, '%FACEBOOK%',                         'out',  'midia'),
  (55, '%SIMPLES NACIONAL%',                 'out',  'impostos'),
  (55, '%RECEITA FEDERAL%',                  'out',  'impostos'),
  (60, '%AGENCIA OM%',                       'out',  'agencias'),
  (60, '%PITACUS%',                          'out',  'agencias'),
  (60, '%TRINITY%',                          'out',  'agencias'),
  (60, '%HEAVYDROPS%',                       'out',  'agencias'),
  (65, '%HAKKA%',                            'out',  'evento'),
  (65, '%ESTANDES%',                         'out',  'evento'),
  (65, '%CENOGRAFIA%',                       'out',  'evento'),
  (65, '%MAGUI LOCACAO%',                    'out',  'evento'),
  (65, '%AUDIO CENTER%',                     'out',  'evento'),
  (65, '%SELECT COLOR%',                     'out',  'evento'),
  (70, '%FAEZ%',                             'out',  'contabilidade'),
  (75, '%L4B LOGISTICA%',                    'out',  'logistica'),
  (75, '%LOGGI%',                            'out',  'logistica'),
  (75, '%CORREIOS%',                         'out',  'logistica'),
  (80, '%ITAU UNIBANCO%',                    'out',  'cartao'),

  -- pessoas: prestadores recorrentes que aparecem no extrato
  (90, '%Kell Cristina%',                    'out',  'equipe'),
  (90, '%Diego Antonio Pereira%',            'out',  'equipe'),
  (90, '%Hemilly Ferreira%',                 'out',  'equipe'),
  (90, '%Moises Cassiano%',                  'out',  'equipe'),
  (90, '%Camila da Silva Barriga%',          'out',  'equipe'),
  (90, '%Ronaldo Alves Pereira%',            'out',  'equipe'),
  (90, '%Antonia Moraes%',                   'out',  'equipe'),
  (90, '%Brilho Dos Meus Olhos%',            'out',  'equipe')
) as v(prioridade, padrao, direction, slug)
join public.fin_categories c on c.slug = v.slug
where not exists (
  select 1 from public.fin_rules r
  where r.padrao = v.padrao and r.direction is not distinct from v.direction
);

-- ========== aplicar regras ==========

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

select public.fin_reclassificar();
