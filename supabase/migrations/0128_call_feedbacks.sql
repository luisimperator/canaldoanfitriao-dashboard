-- Feedback detalhado de cada call pro vendedor, no privado (Fernando, 19/11:
-- "É importante que o vendedor receba um feedback assim que a transcrição
-- chega, ele receba o feedback no privado dele"). Quando a transcrição de uma
-- call do Téo fica pronta, /api/sync/call-feedbacks (cron de 5 em 5 min) gera
-- o feedback com o Claude e guarda aqui; um agente do OpenClaw no PC do
-- Fernando busca os prontos em /api/openclaw/feedbacks e manda no WhatsApp
-- privado do vendedor, e avisa de volta que entregou. Nada é apagado: a
-- entrega só marca entregue_em.
create table if not exists public.call_feedbacks (
  id uuid primary key default gen_random_uuid(),
  teo_call_id uuid not null unique,
  join_url text,
  vendedor text,
  lead text,
  call_inicio timestamptz,
  -- gerando | pronto | erro | sem_call (transcrição que não era call de verdade)
  status text not null default 'gerando',
  texto text,
  erro text,
  tentativas integer not null default 0,
  gerado_em timestamptz,
  entregue_em timestamptz,
  entregue_por text,
  entrega_detalhe text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists call_feedbacks_pendentes
  on public.call_feedbacks (gerado_em)
  where status = 'pronto' and entregue_em is null;

alter table public.call_feedbacks enable row level security;
