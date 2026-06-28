-- Links curtos rastreáveis (QR/links de vídeo). O QR aponta pra /r/<slug>, que
-- redireciona pra LP colando os UTMs. O slug é decidido na criação (antes do
-- vídeo existir), resolvendo o ovo-e-galinha de não saber a URL do vídeo ainda.

create table if not exists public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text,
  product text,
  destination text not null,
  utm_source text default 'youtube',
  utm_medium text default 'qr',
  utm_campaign text,
  youtube_url text,
  created_at timestamptz default now()
);

-- Um registro por scan/clique do QR, p/ medir scan -> lead -> MQL.
create table if not exists public.link_scans (
  id bigint generated always as identity primary key,
  slug text not null,
  scanned_at timestamptz default now(),
  ua text,
  ref text
);
create index if not exists link_scans_slug_idx on public.link_scans(slug);

-- Sem policies: só o service role (servidor) acessa.
alter table public.tracked_links enable row level security;
alter table public.link_scans enable row level security;
