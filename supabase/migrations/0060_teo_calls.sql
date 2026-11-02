-- Téo: marcação de call. O Téo oferece os horários livres de teo_config.horarios
-- e, quando o lead escolhe e passa o e-mail, grava aqui (um lead por horário).
-- O convite (agenda + Meet) é criado depois a partir das linhas "marcada".

create table if not exists public.teo_calls (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null,
  nome text,
  inicio timestamptz not null,
  email text,
  resumo text,
  -- marcada | convite_enviado | cancelada
  status text not null default 'marcada',
  evento_id text,
  criado_em timestamptz not null default now()
);
create unique index if not exists teo_calls_horario_unico on public.teo_calls (inicio) where status <> 'cancelada';
alter table public.teo_calls enable row level security;

-- Horários de call que o Téo pode oferecer (ISO com fuso), editável sem deploy.
alter table public.teo_config add column if not exists horarios jsonb not null default '[]'::jsonb;
