-- Rastreio da LP do Max (/max): cada visita e cada clique no WhatsApp, com as
-- UTMs do link (Fernando, 19/11: "Vou colocar um UTM source aqui, igualzinho
-- eu ponho no Edu (...) como é que eu vou saber que veio daí?"). O clique não
-- leva UTM pro WhatsApp; por isso a mensagem pronta também muda conforme o
-- utm_source (src/lib/max-lp.ts) e o Max fica sabendo de onde a pessoa veio.
-- Sem IP nem dado pessoal.
create table if not exists public.max_lp_eventos (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  tipo text not null check (tipo in ('pv', 'clique')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid boolean not null default false,
  referer text
);

alter table public.max_lp_eventos enable row level security;

create index if not exists max_lp_eventos_criado on public.max_lp_eventos (criado_em desc);
