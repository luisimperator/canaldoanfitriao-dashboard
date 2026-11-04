-- Téo ouve áudio: a transcrição de cada áudio da conversa (do lead ou do time)
-- fica aqui pra não transcrever de novo a cada rodada. msg_id é o id da
-- mensagem no Unnichat; de = contact | user; sem texto e com 3 tentativas, o
-- Téo desiste e o áudio segue como "não consigo ouvir".
create table if not exists public.teo_audios (
  msg_id text primary key,
  contact_id text,
  de text,
  texto text,
  erro text,
  tentativas int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists teo_audios_contact on public.teo_audios (contact_id);
alter table public.teo_audios enable row level security;
