-- Movimentação Grupos (Foley, 21/11, PRs #442 e #443): mensagens por dia nos
-- grupos de membros do A5E e do Gigantes, alimentada pelo Foley todo dia 00h10
-- (histórico desde 12/07/2021 no A5E e 24/03/2024 no Gigantes). A tabela foi
-- criada direto no banco em 21/11; este arquivo só registra o SQL no repo
-- (idempotente).
create table if not exists public.grupo_mensagens_diarias (
  grupo text not null check (grupo in ('a5e', 'gigantes')),
  data date not null,
  mensagens integer not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (grupo, data)
);
alter table public.grupo_mensagens_diarias enable row level security;
drop policy if exists "leitura autenticado" on public.grupo_mensagens_diarias;
create policy "leitura autenticado" on public.grupo_mensagens_diarias for select to authenticated using (true);
