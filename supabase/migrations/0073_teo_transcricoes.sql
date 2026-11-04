-- Téo: transcrição das calls do Teams, buscada pela Graph depois da call.
-- reuniao_id: id da reunião online (onlineMeetings); transcricao: texto
-- "[mm:ss] Nome: fala"; gravacoes: [{id, em}]; transcricao_checada_em: última
-- tentativa (a busca roda a cada 30 min por até 2 dias depois da call).
alter table public.teo_calls add column if not exists reuniao_id text;
alter table public.teo_calls add column if not exists transcricao text;
alter table public.teo_calls add column if not exists transcricao_em timestamptz;
alter table public.teo_calls add column if not exists transcricao_checada_em timestamptz;
alter table public.teo_calls add column if not exists gravacoes jsonb;
