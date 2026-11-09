-- Teste de venda direta do Téo (Black): a cada N leads que vão pra call, o
-- próximo lead novo sem especialista o Téo vende sozinho, sem call, com links
-- utm_source=teo. venda_teo: true = sorteado; false = grupo de comparação;
-- null = antes do teste ou nunca avaliado.
alter table teo_conversas add column if not exists venda_teo boolean;
alter table teo_conversas add column if not exists venda_teo_em timestamptz;
alter table teo_config add column if not exists venda_teo_a_cada integer;
alter table teo_config add column if not exists venda_teo_desde timestamptz;
