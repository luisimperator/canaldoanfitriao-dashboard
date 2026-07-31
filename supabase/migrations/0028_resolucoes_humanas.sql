-- Mesa de resoluções humanas.
--
-- A fila de handoff registrava o PEDIDO e um status, mas não COMO foi
-- resolvido. Sem isso o mesmo caso reaparece todo mês e a IA nunca aprende a
-- resposta — porque a resposta nunca ficou escrita em lugar nenhum.

alter table public.support_handoffs
  add column if not exists resolucao text,
  add column if not exists resolvido_por text,
  add column if not exists virou_regra boolean not null default false,
  add column if not exists kb_id uuid;

create or replace view public.support_resolucoes_stats as
  select
    count(*) filter (where status = 'aberto') as abertos,
    count(*) filter (where status = 'em_andamento') as em_andamento,
    count(*) filter (where status = 'resolvido'
                       and resolved_at > now() - interval '7 days') as resolvidos_7d,
    count(*) filter (where status <> 'resolvido'
                       and created_at < now() - interval '48 hours') as parados_48h,
    round(avg(extract(epoch from (resolved_at - created_at)) / 3600)
          filter (where resolved_at is not null
                    and resolved_at > now() - interval '30 days'), 1) as horas_media_30d
  from public.support_handoffs;
