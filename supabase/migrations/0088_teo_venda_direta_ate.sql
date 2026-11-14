-- Téo: venda direta do dia. Enquanto now() < venda_direta_ate, todo lead da
-- Black sem especialista é do Téo, que vende por aqui sem oferecer call (links
-- com utm_source=teo). Não marca o lead (venda_teo): quando o prazo acaba, o
-- lead volta pro fluxo normal de call. Lead de vendedor continua do vendedor.
alter table public.teo_config add column if not exists venda_direta_ate timestamptz;
comment on column public.teo_config.venda_direta_ate is
  'Venda direta do dia: até quando todo lead sem especialista é do Téo, sem call (null = desligado).';
