-- Avisos de caso novo pro time (e o registro do que já foi avisado).
--
-- O problema: quando a IA escala um caso, ele fica esperando alguém lembrar de
-- abrir o painel. Agora o próprio sistema chama no WhatsApp de quem está de
-- plantão. Como o WhatsApp da Meta só entrega mensagem fora da janela de 24h
-- se ela for um TEMPLATE aprovado, esse aviso vai por template
-- (support_alerta_template, configurável abaixo).

create table if not exists public.support_notificacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- só dígitos, com DDI: 5511999998888
  telefone text not null unique,
  ativo boolean not null default true,
  -- null ou vazio = recebe todos os motivos
  motivos text[],
  observacao text,
  criado_em timestamptz not null default now()
);
alter table public.support_notificacoes enable row level security;

-- Um aviso por (caso, telefone): se o webhook reentregar ou alguém reprocessar,
-- ninguém leva dois toques do mesmo caso.
create table if not exists public.support_alertas (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.support_handoffs(id) on delete cascade,
  telefone text not null,
  ok boolean not null,
  erro text,
  enviado_em timestamptz not null default now(),
  unique (handoff_id, telefone)
);
alter table public.support_alertas enable row level security;

create index if not exists support_alertas_handoff_idx
  on public.support_alertas (handoff_id);

-- Qual template usar no aviso interno. Fica em tabela (e não no código) porque
-- o nome do template é escolhido na hora de criar na Meta e pode mudar.
create table if not exists public.whatsapp_flags_extra (
  chave text primary key,
  valor text
);
alter table public.whatsapp_flags_extra enable row level security;

insert into public.whatsapp_flags_extra (chave, valor) values
  ('alerta_template', 'caso_suporte_novo'),
  ('alerta_idioma', 'pt_BR')
on conflict (chave) do nothing;
