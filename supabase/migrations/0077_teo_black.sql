-- Modo Black do Téo: até quando vale (teo_config.black_ate) e, por conversa,
-- quando passou pro vendedor, pra quem, e quando o Téo retomou porque o
-- vendedor não respondeu em 10 min.
alter table public.teo_config add column if not exists black_ate timestamptz;
alter table public.teo_conversas
  add column if not exists black_passou_em timestamptz,
  add column if not exists black_vendedor text,
  add column if not exists black_retomou_em timestamptz;
