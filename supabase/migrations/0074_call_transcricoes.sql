-- Acervo das calls de vendas no Teams (agenda do anfitriao@): uma linha por
-- reunião, com a transcrição em texto ("[mm:ss] Nome: fala") e a lista de
-- gravações. Alimentado pelo cron /api/sync/calls, separado do Téo: entra
-- toda call da agenda que tem link do Teams, marcada pelo Téo ou não. Serve
-- de base pras análises semanais e mensais das calls.
-- status: aguardando (ainda buscando) | ok (transcrição salva) |
-- sem_transcricao (passou o prazo e não veio nada: call não aconteceu ou não
-- foi transcrita). As colunas de transcrição em teo_calls (0073) deixam de ser
-- usadas.
create table if not exists public.call_transcricoes (
  join_url text primary key,
  evento_id text,
  reuniao_id text,
  assunto text,
  inicio timestamptz,
  fim timestamptz,
  participantes jsonb,
  teo_call_id uuid references public.teo_calls (id) on delete set null,
  contact_id text,
  lead_nome text,
  vendedor text,
  status text not null default 'aguardando',
  transcricao text,
  transcricao_ids jsonb,
  gravacoes jsonb,
  erro text,
  checado_em timestamptz,
  transcrito_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists call_transcricoes_fila on public.call_transcricoes (status, checado_em);
create index if not exists call_transcricoes_inicio on public.call_transcricoes (inicio);
alter table public.call_transcricoes enable row level security;
