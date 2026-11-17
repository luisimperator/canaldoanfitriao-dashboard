-- Lançamento pago semanal: Imersão A5E (ingresso R$ 19,90).
--
-- Um produto fixo na Eduzz e dois links fixos (link.canaldoanfitriao.com.br/
-- imersao e /vip) que apontam pra sala / grupo da turma da semana. Turma = data
-- do sábado do evento. Evento sábado e domingo, 9h–16h (America/Sao_Paulo).
--
-- Só o service role (servidor) lê/escreve: RLS ligado e sem policies, como
-- tracked_links/link_scans.

-- ---------- Turmas ----------
create table if not exists public.imersao_turmas (
  turma_data date primary key,
  sala_url_sabado text,
  sala_url_domingo text,
  inicio_sabado timestamptz not null,
  fim_sabado timestamptz not null,
  inicio_domingo timestamptz not null,
  fim_domingo timestamptz not null,
  grupo_vip_url text,
  grupo_vip_url_2 text,
  grupo_vip_cheio boolean not null default false,
  ativa boolean not null default true,
  -- id da tag datada no Unnichat (imersao-a5e-pago-AAAA-MM-DD), se criada.
  -- Sem ele, a tag datada fica com a automação semanal manual do Unnichat.
  unnichat_tag_id text,
  created_at timestamptz not null default now(),
  constraint imersao_turmas_sabado check (extract(isodow from turma_data) = 6)
);

-- Horários padrão (sábado e domingo, 9h às 16h em São Paulo) quando a turma é
-- criada sem eles — inclusive pelo webhook, quando a venda chega antes de a
-- turma ser cadastrada no painel.
create or replace function public.imersao_turmas_horarios_padrao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.inicio_sabado  := coalesce(new.inicio_sabado,  (new.turma_data + time '09:00') at time zone 'America/Sao_Paulo');
  new.fim_sabado     := coalesce(new.fim_sabado,     (new.turma_data + time '16:00') at time zone 'America/Sao_Paulo');
  new.inicio_domingo := coalesce(new.inicio_domingo, (new.turma_data + 1 + time '09:00') at time zone 'America/Sao_Paulo');
  new.fim_domingo    := coalesce(new.fim_domingo,    (new.turma_data + 1 + time '16:00') at time zone 'America/Sao_Paulo');
  return new;
end;
$$;

drop trigger if exists imersao_turmas_horarios_padrao on public.imersao_turmas;
create trigger imersao_turmas_horarios_padrao
  before insert or update on public.imersao_turmas
  for each row execute function public.imersao_turmas_horarios_padrao();

-- ---------- Compradores ----------
create table if not exists public.imersao_compradores (
  id uuid primary key default gen_random_uuid(),
  eduzz_invoice_id text not null unique,
  email text,
  nome text,
  telefone text,
  turma_data date not null references public.imersao_turmas (turma_data) on update cascade,
  pago_em timestamptz,
  valor numeric(10, 2),
  status text not null default 'pago' check (status in ('pago', 'reembolsado')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  tags_mailchimp_ok boolean not null default false,
  tags_unnichat_ok boolean not null default false,
  tags_erro text,
  tags_tentativas int not null default 0,
  -- linha do webhook_log (caixa-preta da Eduzz) desta venda: etapa/pendente
  -- ficam lá, como nos demais webhooks.
  webhook_log_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists imersao_compradores_turma on public.imersao_compradores (turma_data);
create index if not exists imersao_compradores_email on public.imersao_compradores (lower(email));
create index if not exists imersao_compradores_tags_pendentes
  on public.imersao_compradores (created_at)
  where status = 'pago' and (not tags_mailchimp_ok or not tags_unnichat_ok);

-- ---------- Cliques nos links fixos (/imersao e /vip) ----------
create table if not exists public.imersao_cliques (
  id bigint generated always as identity primary key,
  rota text not null check (rota in ('imersao', 'vip')),
  turma_data date references public.imersao_turmas (turma_data) on update cascade,
  -- imersao: sabado | domingo | antes | intervalo | sem_turma
  -- vip: grupo | grupo_2 | sem_grupo
  momento text,
  destino text,
  email text,
  -- quem clicou: e-mail (se veio na URL) ou hash de IP+navegador, p/ contar únicos
  visitante text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  ua text,
  ref text,
  created_at timestamptz not null default now()
);

create index if not exists imersao_cliques_turma on public.imersao_cliques (turma_data, rota);

alter table public.imersao_turmas enable row level security;
alter table public.imersao_compradores enable row level security;
alter table public.imersao_cliques enable row level security;

-- Resumo por turma (tela Lançamento pago): compradores e cliques nos links
-- fixos. Únicos = por visitante (e-mail quando vem na URL, senão IP+navegador).
-- security_invoker: a view respeita o RLS de quem lê (só o service role).
create or replace view public.imersao_resumo
with (security_invoker = true) as
select
  t.turma_data,
  coalesce(c.pagos, 0) as pagos,
  coalesce(c.reembolsados, 0) as reembolsados,
  coalesce(c.receita, 0) as receita,
  coalesce(c.mailchimp_pendentes, 0) as mailchimp_pendentes,
  coalesce(c.unnichat_pendentes, 0) as unnichat_pendentes,
  coalesce(k.vip_cliques, 0) as vip_cliques,
  coalesce(k.vip_unicos, 0) as vip_unicos,
  coalesce(k.sabado_cliques, 0) as sabado_cliques,
  coalesce(k.sabado_unicos, 0) as sabado_unicos,
  coalesce(k.domingo_cliques, 0) as domingo_cliques,
  coalesce(k.domingo_unicos, 0) as domingo_unicos,
  coalesce(k.fora_cliques, 0) as fora_cliques
from public.imersao_turmas t
left join (
  select turma_data,
    count(*) filter (where status = 'pago') as pagos,
    count(*) filter (where status = 'reembolsado') as reembolsados,
    sum(valor) filter (where status = 'pago') as receita,
    count(*) filter (where status = 'pago' and not tags_mailchimp_ok) as mailchimp_pendentes,
    count(*) filter (where status = 'pago' and not tags_unnichat_ok) as unnichat_pendentes
  from public.imersao_compradores
  group by turma_data
) c using (turma_data)
left join (
  select turma_data,
    count(*) filter (where rota = 'vip') as vip_cliques,
    count(distinct visitante) filter (where rota = 'vip') as vip_unicos,
    count(*) filter (where rota = 'imersao' and momento = 'sabado') as sabado_cliques,
    count(distinct visitante) filter (where rota = 'imersao' and momento = 'sabado') as sabado_unicos,
    count(*) filter (where rota = 'imersao' and momento = 'domingo') as domingo_cliques,
    count(distinct visitante) filter (where rota = 'imersao' and momento = 'domingo') as domingo_unicos,
    count(*) filter (where rota = 'imersao' and momento not in ('sabado', 'domingo')) as fora_cliques
  from public.imersao_cliques
  where turma_data is not null
  group by turma_data
) k using (turma_data);

revoke all on public.imersao_resumo from anon, authenticated;

-- Primeira turma.
insert into public.imersao_turmas (turma_data) values ('2026-11-21') on conflict do nothing;
