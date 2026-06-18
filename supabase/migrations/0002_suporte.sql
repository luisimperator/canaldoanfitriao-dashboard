-- Suporte ao cliente final (pós-venda) — Fase 1.
--
-- Duas tabelas novas, aditivas (não mexem em nada existente):
--   support_kb        — base de conhecimento / treinamento da IA (os 6 blocos)
--   support_handoffs  — fila de atendimento humano (a IA escala um caso pra cá)
--
-- As conversas do WhatsApp (Meta Cloud API) entram em fase posterior.
-- A leitura no dashboard é feita com a service role (getSupabaseAdmin), então
-- o RLS fica ligado SEM policy de anon: ninguém com a chave pública lê estes
-- dados (há e-mail/telefone de cliente em support_handoffs).

create table if not exists public.support_kb (
  id uuid primary key default gen_random_uuid(),
  -- bloco do treinamento: ingressos | renovacao | acesso | dados | pagamento |
  -- brindes | regras_ouro | outro
  bloco text not null default 'outro',
  titulo text not null,
  conteudo text not null default '',
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_kb_bloco_idx on public.support_kb (bloco, ordem);

create table if not exists public.support_handoffs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text,
  nome text,
  telefone text,
  -- motivo: cancelamento_renovacao | reembolso | divergencia_pagamento |
  -- brinde_nao_recebido | resgate_bf | duvida_acesso | lead_comercial | outro
  motivo text not null default 'outro',
  resumo text,
  dados_coletados jsonb,
  status text not null default 'aberto'
    check (status in ('aberto', 'em_andamento', 'resolvido')),
  responsavel text,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists support_handoffs_status_idx
  on public.support_handoffs (status, created_at desc);

alter table public.support_kb enable row level security;
alter table public.support_handoffs enable row level security;
