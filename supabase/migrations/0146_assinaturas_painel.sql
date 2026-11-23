-- Aba Assinaturas (/internos/assinaturas, pedido do Gusta em 23/11):
-- ativas e inativas da Eduzz, quem nunca reativou, LTV e o registro manual de
-- ocorrências por aluno (troca de número, pessoa adicional, observação).
--
-- Dado de aluno é confidencial: a tabela nova e a função ficam só pro
-- servidor (service role), como as demais do controle de assinantes (0102).

-- ── Registro manual de ocorrências ─────────────────────────────────────────

create table if not exists public.assinatura_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  email text,                  -- e-mail do aluno na Eduzz (minúsculo): liga com a assinatura
  nome text,
  produto text,                -- produto/compra a que a ocorrência se refere (texto livre)
  tipo text not null check (tipo in ('troca_numero', 'pessoa_adicional', 'observacao')),
  numero_antigo text,          -- troca de número: o que saiu
  numero_novo text,            -- troca de número: o que entrou; pessoa adicional: o número dela
  pessoa_adicional text,       -- nome da pessoa adicional
  observacao text,
  data_ocorrencia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  registrado_por text not null,  -- e-mail de quem registrou no painel (ou 'Foley', 'Max')
  origem text not null default 'painel',
  criado_em timestamptz not null default now()
);
create index if not exists assinatura_ocorrencias_email_idx on public.assinatura_ocorrencias (lower(email));

alter table public.assinatura_ocorrencias enable row level security;
revoke all on public.assinatura_ocorrencias from anon, authenticated;
create or replace trigger assinatura_ocorrencias_sem_delete
  before delete on public.assinatura_ocorrencias
  for each row execute function public.assinantes_sem_delete();

-- ── Linhas da aba ──────────────────────────────────────────────────────────
-- Uma linha por assinatura (ou venda única) com o que já foi pago nela, o LTV
-- do aluno (tudo o que pagou na Eduzz) e se, depois de sair, voltou.
-- Linha de produto: A5E (curso, grupo e cadeiras), Gigantes (e pessoa
-- adicional), Max, Black Friday; o resto é o próprio produto. A Black ativa
-- conta como volta pro A5E e pro Gigantes (libera os dois grupos).

create or replace function public.assin_painel_linhas()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with pagos as (
    select s.data->>'contractId' as contrato,
           count(*) as faturas,
           sum((s.data->'total'->>'value')::numeric) as pago
    from eduzz_sales_raw s
    where s.status = 'paid' and s.data->>'contractId' is not null
    group by 1
  ),
  ltv as (
    select lower(s.email) as email, sum((s.data->'total'->>'value')::numeric) as ltv
    from eduzz_sales_raw s
    where s.status = 'paid' and s.email is not null
    group by 1
  ),
  base as (
    select a.id_assinatura_eduzz,
           a.tipo,
           a.produto_eduzz_id,
           a.produto,
           a.status,
           a.status_normalizado,
           a.inicio,
           a.proximo_vencimento,
           a.valor,
           lower(a.email_comprador) as email,
           a.dados->'client'->>'name' as nome,
           case when coalesce(a.dados->'client'->'phone'->>'number', '') <> '' then
             '+' || coalesce(a.dados->'client'->'phone'->>'countryCode', '') || coalesce(a.dados->'client'->'phone'->>'areaCode', '') || (a.dados->'client'->'phone'->>'number')
           end as telefone,
           case
             when a.produto_eduzz_id in ('1702138', '1783828', '1760209', '2626179', '1760222', '2811180') then 'A5E'
             when a.produto_eduzz_id in ('2297739', '2837267') then 'Gigantes'
             when a.produto_eduzz_id = '3152952' then 'Max'
             when a.produto_eduzz_id = '2914907' then 'Black Friday'
             else coalesce(a.produto, a.produto_eduzz_id)
           end as linha,
           -- saída = quando cancelou/suspendeu na Eduzz; acesso_ate = quando a
           -- Eduzz tira (ou tirou) o acesso (pode ser no futuro: pagou até lá).
           case when jsonb_typeof(a.dados->'interruption') = 'object' then
             (coalesce(a.dados->'interruption'->>'createdAt', a.dados->'interruption'->>'removeAccessDate')::timestamptz at time zone 'America/Sao_Paulo')::date
           end as saida,
           case when jsonb_typeof(a.dados->'interruption') = 'object' then
             ((a.dados->'interruption'->>'removeAccessDate')::timestamptz at time zone 'America/Sao_Paulo')::date
           end as acesso_ate,
           a.dados->'interruption'->>'reason' as motivo_saida,
           case when a.tipo = 'venda_unica' then (case when a.status = 'paid' then 1 else 0 end) else coalesce(p.faturas, 0) end as faturas_pagas,
           case when a.tipo = 'venda_unica' then (case when a.status = 'paid' then coalesce(a.valor, 0) else 0 end) else coalesce(p.pago, 0) end as pago
    from assinaturas_eduzz a
    left join pagos p on p.contrato = a.id_assinatura_eduzz
  ),
  ativos as (
    -- e-mail x linha com alguma assinatura ativa ou atrasada hoje
    select distinct email, linha from base where status_normalizado in ('ativa', 'atrasada') and email is not null
    union
    select distinct email, l from base, unnest(array['A5E', 'Gigantes']) l
    where linha = 'Black Friday' and status_normalizado = 'ativa' and email is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id_assinatura_eduzz,
           'tipo', b.tipo,
           'produto_id', b.produto_eduzz_id,
           'produto', b.produto,
           'linha', b.linha,
           'status', b.status,
           'situacao', b.status_normalizado,
           'inicio', b.inicio,
           'vencimento', b.proximo_vencimento,
           'valor', b.valor,
           'email', b.email,
           'nome', b.nome,
           'telefone', b.telefone,
           'saida', b.saida,
           'acesso_ate', b.acesso_ate,
           'motivo_saida', b.motivo_saida,
           'faturas_pagas', b.faturas_pagas,
           'pago', b.pago,
           'ltv_aluno', coalesce(l.ltv, 0),
           'voltou', (b.status_normalizado in ('cancelada', 'reembolsada', 'expirada')
                      and exists (select 1 from ativos x where x.email = b.email and x.linha = b.linha))
         ) order by b.inicio desc nulls last), '[]'::jsonb)
  from base b
  left join ltv l on l.email = b.email;
$$;

revoke all on function public.assin_painel_linhas() from public, anon, authenticated;
grant execute on function public.assin_painel_linhas() to service_role;
