-- Link da call pelo WhatsApp logo depois de gerado (Fernando, 18/11: "manda o
-- link pra ele logo depois de gerado na agenda, e depois de novo na hora").
-- Marca quando o link saiu, pra não mandar duas vezes.
alter table public.teo_calls add column if not exists link_enviado_em timestamptz;
