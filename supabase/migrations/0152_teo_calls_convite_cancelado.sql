-- Call cancelada pelo banco (comprador da Imersão, 25/11; migração 0151) fica
-- com o convite do Teams de pé: o http do Postgres não alcança a Microsoft
-- (SSL_ERROR_SYSCALL em login.microsoftonline.com). A rodada do Téo cancela o
-- convite pela Graph e marca aqui quando conseguiu.
alter table public.teo_calls add column if not exists convite_cancelado_em timestamptz;
