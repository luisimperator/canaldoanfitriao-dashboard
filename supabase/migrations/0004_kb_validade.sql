-- Validade opcional para itens do treinamento (support_kb).
--
-- Alguns itens têm prazo (ex.: data/preço de um evento). Com "valido_ate"
-- preenchido, a IA deixa de usar o item depois dessa data — e a tela do
-- Treinamento mostra o item como "expirado" pra lembrar de atualizar.
-- Null = sem validade (item permanente).

alter table public.support_kb add column if not exists valido_ate date;

comment on column public.support_kb.valido_ate is
  'Data até a qual o item vale (ex.: data de um evento). Após essa data a IA deixa de usar o item. Null = sem validade.';
