-- Téo: escada de cupons na venda por mensagem, com o "vou confirmar com a equipe".
-- teo_config.cupons: a escada que o Téo pode usar (lista editável sem deploy).
-- teo_conversas.cupom_pendente/cupom_em: o pedido "à equipe" e quando o Téo
-- volta com a condição (alguns minutos depois).
alter table public.teo_config add column if not exists cupons jsonb not null default '[]'::jsonb;
comment on column public.teo_config.cupons is
  'Escada de cupons do Téo na venda por mensagem: [{codigo, produto, degrau, para, quando, condicao, link, bonus}].';
alter table public.teo_conversas add column if not exists cupom_pendente jsonb;
alter table public.teo_conversas add column if not exists cupom_em timestamptz;
