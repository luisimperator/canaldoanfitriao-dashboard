-- Suporte — Fase 3 (WhatsApp pela Meta Cloud API).
--
-- Guarda as mensagens trocadas no WhatsApp do suporte, para:
--   - dar memória de conversa pra IA (histórico por telefone)
--   - deduplicar entregas repetidas do webhook da Meta (wa_message_id unique)
--   - alimentar a caixa de entrada do Suporte mais pra frente
--
-- Aplicada via service role; RLS ligado sem policy de anon (contém telefone/PII).

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  wa_phone text not null,
  direction text not null check (direction in ('in', 'out')),
  text text,
  wa_message_id text unique,
  escalated boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_phone_idx
  on public.support_messages (wa_phone, created_at);

alter table public.support_messages enable row level security;
