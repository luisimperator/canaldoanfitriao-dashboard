-- Painel Calls: a função painel_calls passa a dizer de onde veio a venda da
-- call (Eduzz, Asaas ou TMB), pra receita do painel separar por plataforma.
-- A régua não muda (0084). Como o tipo de retorno muda, a função é recriada;
-- teo_fechamento_em_call só lê colunas que continuam iguais.

drop function if exists public.painel_calls(timestamptz, timestamptz);

create or replace function public.painel_calls(p_de timestamptz, p_ate timestamptz)
returns table (
  id uuid,
  contact_id text,
  nome text,
  email text,
  vendedor text,
  inicio timestamptz,
  criado_em timestamptz,
  situacao text,
  fonte text,
  presenca_nota text,
  presenca_por text,
  duracao_min numeric,
  venda_valor numeric,
  venda_produto text,
  venda_em timestamptz,
  venda_por text,
  venda_origem text,
  vespera_em timestamptz,
  lembrete_em timestamptz,
  esperando_em timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with base as (
    select k.*,
           lower(trim(coalesce(k.email, ''))) as em,
           right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 8) as tel,
           calls_nome_tokens(coalesce(k.nome, c.nome)) as tokens,
           t.status as tst,
           t.transcricao as ttexto
      from teo_calls k
      left join teo_conversas c on c.contact_id = k.contact_id
      left join lateral (
        select x.status, x.transcricao
          from call_transcricoes x
         where x.teo_call_id = k.id
         order by (x.status = 'ok') desc, x.criado_em desc
         limit 1
      ) t on true
     where k.inicio >= p_de and k.inicio < p_ate
  ),
  calls as (
    select b.*,
           case
             when b.status = 'cancelada' then 'cancelada'
             when b.inicio > now() then 'futura'
             when b.presenca = 'realizada' then 'aconteceu'
             when b.presenca = 'falta' then 'falta'
             when b.tst = 'ok' then 'aconteceu'
             when b.inicio < timestamptz '2026-11-09 03:00:00+00' then 'sem_dado'
             when b.tst = 'sem_transcricao' then 'falta'
             when b.tst = 'aguardando' then 'apuracao'
             when b.inicio > now() - interval '24 hours' then 'apuracao'
             else 'falta'
           end as sit,
           case
             when b.status = 'cancelada' or b.inicio > now() then null
             when b.presenca is not null then b.presenca_fonte
             when b.tst = 'ok' then 'teams'
           end as fon,
           -- Duração: a última fala da transcrição. Só nas calls que aconteceram
           -- no Teams (a gravação do vendedor sozinho na sala não conta).
           case when b.tst = 'ok' and b.presenca is distinct from 'falta' then
             (select round(max(coalesce(m[1]::int, 0) * 3600 + m[2]::int * 60 + m[3]::int) / 60.0, 1)
                from regexp_matches(coalesce(b.ttexto, ''), '\[(?:(\d+):)?(\d{1,2}):(\d{2})\]', 'g') as m)
           end as dur
      from base b
  ),
  vendas_brutas as (
    select 'sales:' || s.id::text as venda_id,
           case when s.fonte = 'asaas' then 'Asaas' else 'Eduzz' end as origem,
           s.created_at as quando,
           s.amount::numeric as valor,
           s.product as produto,
           lower(trim(coalesce(s.buyer_email, ''))) as em,
           right(regexp_replace(coalesce(r.data -> 'buyer' ->> 'phone', ''), '\D', '', 'g'), 8) as tel,
           calls_nome_tokens(coalesce(s.buyer_name, r.data -> 'buyer' ->> 'name')) as tokens
      from sales s
      left join eduzz_sales_raw r on r.id = s.eduzz_invoice_id
     where s.status = 'paga'
       and s.created_at >= p_de and s.created_at < p_ate + interval '48 hours'
    union all
    select 'tmb:' || p.pedido_id::text,
           'TMB',
           coalesce(p.criado_em, p.updated_at),
           p.valor_total,
           p.lancamento,
           lower(trim(coalesce(p.email, ''))),
           right(regexp_replace(coalesce(p.data ->> 'telefone', ''), '\D', '', 'g'), 8),
           calls_nome_tokens(p.cliente)
      from tmb_pedidos_raw p
     where p.status_pedido = 'Efetivado'
       and coalesce(p.criado_em, p.updated_at) >= p_de
       and coalesce(p.criado_em, p.updated_at) < p_ate + interval '48 hours'
    union all
    select 'tmb:' || coalesce(v.pedido_id, 'evento-' || v.id::text),
           'TMB',
           v.recebido_em,
           v.valor,
           v.produto,
           lower(trim(coalesce(v.email, ''))),
           right(regexp_replace(coalesce(v.telefone, v.payload ->> 'telefone_ativo', ''), '\D', '', 'g'), 8),
           calls_nome_tokens(v.nome)
      from tmb_eventos v
     where v.evento = 'vendas' and v.status = 'Efetivado'
       and v.recebido_em >= p_de and v.recebido_em < p_ate + interval '48 hours'
  ),
  vendas as (
    select distinct on (vb.venda_id) vb.* from vendas_brutas vb order by vb.venda_id, vb.quando
  ),
  pares as (
    select c.id as call_id, v.venda_id, v.origem, v.quando, v.valor, v.produto,
           case
             when c.em <> '' and v.em = c.em then 'e-mail'
             when length(c.tel) = 8 and v.tel = c.tel then 'telefone'
             else 'nome'
           end as por,
           row_number() over (
             partition by v.venda_id
             order by (c.sit = 'aconteceu') desc, c.inicio desc
           ) as rk
      from calls c
      join vendas v
        on v.quando >= c.inicio
       and v.quando < c.inicio + interval '48 hours'
       and ((c.em <> '' and v.em = c.em)
            or (length(c.tel) = 8 and v.tel = c.tel)
            or calls_mesmo_nome(c.tokens, v.tokens))
     where c.sit not in ('cancelada', 'futura')
  ),
  venda_da_call as (
    select pa.call_id,
           sum(pa.valor) as valor,
           string_agg(distinct pa.produto, ' + ') as produto,
           min(pa.quando) as quando,
           (array_agg(pa.por order by pa.quando))[1] as por,
           string_agg(distinct pa.origem, ' + ') as origem
      from pares pa
     where pa.rk = 1
     group by pa.call_id
  )
  select c.id, c.contact_id, c.nome, c.email, c.vendedor, c.inicio, c.criado_em,
         c.sit, c.fon, c.presenca_nota, c.presenca_por, c.dur,
         v.valor, v.produto, v.quando, v.por, v.origem,
         c.vespera_em, c.lembrete_em, c.esperando_em
    from calls c
    left join venda_da_call v on v.call_id = c.id
   order by c.inicio;
$$;

revoke all on function public.painel_calls(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.painel_calls(timestamptz, timestamptz) to service_role;
