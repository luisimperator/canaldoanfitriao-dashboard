-- Téo: acompanhamento de quem parou de responder (mesmo dia, D+1, D+3, D+7,
-- D+21) e checagem espaçada das conversas paradas (não precisa ler todo
-- histórico a cada minuto).
alter table public.teo_conversas add column if not exists followup_etapa int not null default 0;
alter table public.teo_conversas add column if not exists silencio_desde timestamptz;
alter table public.teo_conversas add column if not exists followup_em timestamptz;
alter table public.teo_conversas add column if not exists proxima_checagem timestamptz;
create index if not exists teo_conversas_proxima_checagem on public.teo_conversas (proxima_checagem);

-- Horas desde o silêncio e templates aprovados de cada etapa (usados quando a
-- janela de 24h já fechou; com a janela aberta o Téo escreve a mensagem).
alter table public.teo_config add column if not exists followup_horas jsonb not null default '[3, 24, 72, 168, 504]'::jsonb;
alter table public.teo_config add column if not exists followup_templates jsonb not null default '[]'::jsonb;
update public.teo_config set followup_templates = '[
  "1308926341125998",
  "1075649208754464",
  "1677952009943628",
  "2378688632938377",
  "4329122963971853"
]'::jsonb where id = 1 and followup_templates = '[]'::jsonb;
comment on column public.teo_config.followup_templates is
  'Templates por etapa (janela fechada): followup_1_ (tá por aí?), cobrar_retorno, followup_22_ (horário melhor?), followup_222 (desistiu do projeto?), followup_333 (despedida).';
