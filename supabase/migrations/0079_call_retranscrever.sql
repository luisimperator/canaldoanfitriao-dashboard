-- Transcrição refeita pela gravação da call (sync/calls, etapa "refazer"):
-- a Teams transcrevia em inglês as reuniões criadas com idioma en-US.
--   retranscrever      → marcada pra refazer pela gravação (Whisper, pt)
--   transcricao_fonte  → 'teams' ou 'gravação'
--   transcricao_teams  → o texto original da Teams (dá os nomes de quem fala)
alter table call_transcricoes add column if not exists retranscrever boolean not null default false;
alter table call_transcricoes add column if not exists transcricao_fonte text;
alter table call_transcricoes add column if not exists transcricao_teams text;
create index if not exists call_transcricoes_retranscrever on call_transcricoes (retranscrever) where retranscrever;
