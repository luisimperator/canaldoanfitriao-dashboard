-- Piso operacional de R$ 50 mil → R$ 35 mil.
--
-- Decisão do sócio depois de olhar a curva: com piso de 50k a distribuição de
-- 10/08 dava R$ 88 mil e o fundo de caixa ficava em R$ 65 mil (50k de piso +
-- 15,4k que tinham ido pro cofre) — folga demais parada. Com piso de 35k a
-- distribuição vai a R$ 100 mil e o fundo fica em ~R$ 52 mil (35k + cofre).
--
-- Risco assumido e declarado: a despesa de rotina é ~R$ 45 mil/mês, então o
-- piso de 35k cobre ~3 semanas de giro (antes cobria ~5). O cofre continua
-- recebendo 15% da distribuição e, quando passar dos 35k, vira ele o colchão.

update public.politica_caixa set piso_operacional = 35000 where id = 1;
