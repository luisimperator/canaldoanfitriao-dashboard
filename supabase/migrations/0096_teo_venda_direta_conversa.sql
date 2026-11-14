-- Venda direta por conversa. Regra do Fernando (14/11): quando a venda direta
-- do fim de semana acaba (teo_config.venda_direta_ate, domingo 14h), quem estava
-- comprando com o Téo continua com ele; quem não comprou até o próximo dia útil
-- (segunda 10h) volta pro fluxo de call. O Téo grava aqui, em cada conversa que
-- atende durante a venda direta, até quando ela continua sendo dele.
alter table public.teo_conversas add column if not exists venda_direta_ate timestamptz;
