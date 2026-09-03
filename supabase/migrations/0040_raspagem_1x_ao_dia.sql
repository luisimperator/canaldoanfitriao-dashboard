-- Raspagem 1× ao dia, só às 19h40 BRT (22h40 UTC).
--
-- A 0039 tinha criado três janelas (manhã, tarde e noite). Uma só basta: o
-- dinheiro dorme no Inter e não no gateway, que era o objetivo. A janela que
-- sobra é a da noite de propósito — é a que pega o dia inteiro de vendas já
-- liquidado, e ainda cai ANTES das 20h, quando entra o limite noturno de Pix.
--
-- Efeito colateral bom: menos disparos, menos risco de furar a cota de 30 Pix
-- de saída grátis/mês do Asaas (com 1×/dia + o piso, sobra folga).

select cron.unschedule('raspagem-asaas-manha');
select cron.unschedule('raspagem-asaas-tarde');
